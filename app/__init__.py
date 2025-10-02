from flask import Flask, request, jsonify, render_template
import requests
import pdfplumber
import re
import json

# AI endpoint configuration
AI_ENDPOINT = "https://ai-bis.cfapps.eu10.hana.ondemand.com/ai-agent/getAI_response"

# EDI segment patterns
EDI_SEGMENTS = ['ISA', 'GS', 'ST', 'BAK', 'REF', 'DTM', 'N1', 'PO1', 'ACK', 'CTT', 'SE', 'GE', 'IEA']

def extract_pdf_text(pdf_file):
    """Extract text from PDF file"""
    pdf_text = ""
    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pdf_text += text + "\n"
    return pdf_text

def filter_edi_lines(pdf_text):
    """Filter lines that contain EDI segments and M/O requirements"""
    filtered_lines = []
    lines = pdf_text.splitlines()
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        line_upper = line.upper()
        
        # Check if line contains EDI segment
        has_segment = False
        for segment in EDI_SEGMENTS:
            # Look for segment at start of line or after whitespace
            if (line_upper.startswith(segment + ' ') or 
                line_upper.startswith(segment + '\t') or
                ' ' + segment + ' ' in line_upper or
                '\t' + segment + ' ' in line_upper or
                segment + '01' in line_upper or  # For element patterns like ST01, SE01
                segment + '02' in line_upper or
                segment + '03' in line_upper):
                has_segment = True
                break
        
        # Check for M/O requirements (with more flexibility)
        has_requirement = (' M ' in line or ' O ' in line or 
                          line.startswith('M ') or line.startswith('O ') or
                          line.endswith(' M') or line.endswith(' O') or
                          '\tM\t' in line or '\tO\t' in line)
        
        # Also check for other usage indicators
        has_usage_indicator = any(keyword in line_upper for keyword in [
            'MUST USE', 'USED', 'NOT USED', 'MAY USE', 'MANDATORY', 'OPTIONAL'
        ])
        
        if has_segment and (has_requirement or has_usage_indicator):
            filtered_lines.append(line)
    
    return filtered_lines

def chunk_iter(lines, chunk_size=5):
    """Split lines into chunks of specified size"""
    for i in range(0, len(lines), chunk_size):
        yield lines[i:i + chunk_size]

def call_ai_endpoint_chunk(chunk_lines):
    """Call AI endpoint for a chunk of lines"""
    system_prompt = "You are an EDI 855 specification expert. Analyze the provided lines and extract segment information. ALWAYS return ONLY valid JSON, no markdown, no explanations."
    
    user_prompt = f"""
Analyze these EDI specification lines and return a JSON response in this exact format:
{{
  "segment_tag": {{
    "x12_requirement": "mandatory" or "optional",
    "company_usage": "must_use" or "used" or "conditional" or "not_used",
    "min_usage": number,
    "max_usage": number
  }}
}}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations.

Rules:
- If line contains " M " then x12_requirement is "mandatory"
- If line contains " O " then x12_requirement is "optional"
- Map company usage: "Must Use" -> "must_use", "Used" -> "used", "May Use" -> "conditional", "Not Used" -> "not_used"
- Extract min/max usage numbers if present (e.g., "1/1" means min=1, max=1)

Lines to analyze:
{chr(10).join(chunk_lines)}
"""
    
    try:
        response = requests.post(
            AI_ENDPOINT,
            json={
                "system_prompt": system_prompt,
                "user_prompt": user_prompt
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def build_local_segment_dict(lines):
    """Build segment dictionary locally as fallback"""
    result = {}
    
    for line in lines:
        line_upper = line.upper()
        
        # Find segment with better matching
        segment = None
        for seg in EDI_SEGMENTS:
            # Look for exact segment matches
            if (line_upper.startswith(seg + ' ') or 
                line_upper.startswith(seg + '\t') or
                ' ' + seg + ' ' in line_upper or
                '\t' + seg + ' ' in line_upper or
                seg + '01' in line_upper or  # Element patterns
                seg + '02' in line_upper):
                segment = seg
                break
        
        if not segment:
            continue
            
        # Extract requirements with more flexibility
        x12_req = None
        if (' M ' in line or line.startswith('M ') or line.endswith(' M') or '\tM\t' in line):
            x12_req = "mandatory"
        elif (' O ' in line or line.startswith('O ') or line.endswith(' O') or '\tO\t' in line):
            x12_req = "optional"
        
        # Extract company usage
        company_usage = None
        if "MUST USE" in line_upper:
            company_usage = "must_use"
        elif "NOT USED" in line_upper:
            company_usage = "not_used"
        elif "MAY USE" in line_upper:
            company_usage = "conditional"
        elif "USED" in line_upper:  # Check this after NOT USED
            company_usage = "used"
        
        # Extract min/max usage
        min_usage, max_usage = None, None
        usage_match = re.search(r'(\d+)/(\d+)', line)
        if usage_match:
            min_usage = int(usage_match.group(1))
            max_usage = int(usage_match.group(2))
        
        # Only add if we don't already have this segment or if this has more info
        if segment not in result:
            result[segment] = {
                "x12_requirement": x12_req,
                "company_usage": company_usage,
                "min_usage": min_usage,
                "max_usage": max_usage
            }
        else:
            # Merge with existing entry, preferring non-None values
            existing = result[segment]
            if x12_req and not existing.get("x12_requirement"):
                existing["x12_requirement"] = x12_req
            if company_usage and not existing.get("company_usage"):
                existing["company_usage"] = company_usage
            if min_usage and not existing.get("min_usage"):
                existing["min_usage"] = min_usage
            if max_usage and not existing.get("max_usage"):
                existing["max_usage"] = max_usage
    
    return result

def merge_results(ai_results, local_result):
    """Merge AI results with local fallback"""
    merged = local_result.copy()
    
    for ai_result in ai_results:
        if "error" in ai_result:
            continue
            
        # Handle different response structures
        ai_data = ai_result
        
        # Try to extract response from different possible keys
        if isinstance(ai_result, dict):
            if 'response' in ai_result:
                ai_data = ai_result['response']
            elif 'data' in ai_result:
                ai_data = ai_result['data']
            elif 'result' in ai_result:
                ai_data = ai_result['result']
        
        # If it's a string, try to parse as JSON
        if isinstance(ai_data, str):
            try:
                # Remove markdown code blocks if present
                if ai_data.startswith('```json'):
                    ai_data = ai_data[7:]
                if ai_data.endswith('```'):
                    ai_data = ai_data[:-3]
                ai_data = ai_data.strip()
                ai_data = json.loads(ai_data)
            except json.JSONDecodeError:
                continue
        
        # Now merge if it's a valid dict
        if isinstance(ai_data, dict):
            for segment, data in ai_data.items():
                if isinstance(data, dict):
                    if segment in merged:
                        # Merge with priority to AI data
                        for key, value in data.items():
                            if value is not None:
                                merged[segment][key] = value
                    else:
                        merged[segment] = data
    
    return merged

def parse_edi_elements(edi_data):
    """Parse EDI data into individual elements with positions"""
    parsed_elements = []
    
    if not edi_data:
        return parsed_elements
    
    # Split by lines and process each segment
    lines = edi_data.splitlines()
    
    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if not line or '~' not in line:
            continue
        
        # Remove the trailing ~ and split by *
        segment_data = line.rstrip('~')
        if '*' not in segment_data:
            continue
            
        elements = segment_data.split('*')
        segment_tag = elements[0] if elements else ''
        
        # Parse each element with its position
        for i, element in enumerate(elements):
            if i == 0:
                # First element is the segment tag itself
                parsed_elements.append({
                    'line_number': line_num,
                    'segment_tag': segment_tag,
                    'element_position': 'Segment ID',
                    'element_code': segment_tag,
                    'element_value': element,
                    'element_description': f'{segment_tag} - Segment Identifier'
                })
            else:
                # Subsequent elements are numbered positions
                element_code = f'{segment_tag}{i:02d}'
                parsed_elements.append({
                    'line_number': line_num,
                    'segment_tag': segment_tag,
                    'element_position': f'{segment_tag}{i:02d}',
                    'element_code': element_code,
                    'element_value': element if element else '(empty)',
                    'element_description': get_element_description(segment_tag, i, element)
                })
    
    return parsed_elements

def get_element_description(segment_tag, position, value):
    """Get description for specific EDI elements"""
    descriptions = {
        'ISA': {
            1: 'Authorization Information Qualifier',
            2: 'Authorization Information',
            3: 'Security Information Qualifier', 
            4: 'Security Information',
            5: 'Interchange ID Qualifier',
            6: 'Interchange Sender ID',
            7: 'Interchange ID Qualifier',
            8: 'Interchange Receiver ID',
            9: 'Interchange Date',
            10: 'Interchange Time',
            11: 'Interchange Control Standards Identifier',
            12: 'Interchange Control Version Number',
            13: 'Interchange Control Number',
            14: 'Acknowledgment Requested',
            15: 'Usage Indicator',
            16: 'Component Element Separator'
        },
        'GS': {
            1: 'Functional Identifier Code',
            2: 'Application Sender\'s Code',
            3: 'Application Receiver\'s Code', 
            4: 'Date',
            5: 'Time',
            6: 'Group Control Number',
            7: 'Responsible Agency Code',
            8: 'Version / Release / Industry Identifier Code'
        },
        'ST': {
            1: 'Transaction Set Identifier Code',
            2: 'Transaction Set Control Number'
        },
        'BAK': {
            1: 'Transaction Set Purpose Code',
            2: 'Acknowledgment Type',
            3: 'Purchase Order Number',
            4: 'Date'
        },
        'PO1': {
            1: 'Assigned Identification',
            2: 'Quantity Ordered',
            3: 'Unit or Basis for Measurement Code',
            4: 'Unit Price',
            5: 'Basis of Unit Price Code',
            6: 'Product/Service ID Qualifier',
            7: 'Product/Service ID',
            8: 'Product/Service ID Qualifier',
            9: 'Product/Service ID',
            10: 'Product/Service ID Qualifier',
            11: 'Product/Service ID'
        },
        'ACK': {
            1: 'Line Item Status Code',
            2: 'Quantity',
            3: 'Unit or Basis for Measurement Code',
            4: 'Date/Time Qualifier',
            5: 'Date',
            6: 'Request Reference Number',
            7: 'Product/Service ID Qualifier',
            8: 'Product/Service ID'
        },
        'CTT': {
            1: 'Number of Line Items'
        },
        'SE': {
            1: 'Number of Included Segments',
            2: 'Transaction Set Control Number'
        },
        'GE': {
            1: 'Number of Transaction Sets Included',
            2: 'Group Control Number'
        },
        'IEA': {
            1: 'Number of Included Functional Groups',
            2: 'Interchange Control Number'
        }
    }
    
    if segment_tag in descriptions and position in descriptions[segment_tag]:
        return descriptions[segment_tag][position]
    else:
        return f'{segment_tag} Element {position}'

def create_app():

    app = Flask(__name__, static_folder='static')
    
    # Add CORS headers manually
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    
    @app.route('/options-workaround', methods=['OPTIONS'])
    def handle_options():
        return '', 200

    @app.route('/', methods=['GET'])
    def index():
       return render_template('index.html')

    @app.route('/upload', methods=['GET'])
    def upload():
       return render_template('upload.html')

    @app.route('/test-spec', methods=['POST'])
    def test_spec():
        """Test endpoint that doesn't require file upload"""
        try:
            # Test with sample lines
            sample_lines = [
                'ST  M  1/1 Must Use - Transaction Set Header',
                'BAK M 1/1 Used - Beginning Segment', 
                'PO1 O 1/100 May Use - Baseline Item Data',
                'ACK O 0/100 Not Used - Line Item Acknowledgment',
                'CTT M 1/1 - Transaction Totals'
            ]
            
            # Build local result
            local_result = build_local_segment_dict(sample_lines)
            
            # Process in chunks with AI (using sample data)
            ai_results = []
            chunks = list(chunk_iter(sample_lines, 3))
            
            for chunk in chunks:
                ai_response = call_ai_endpoint_chunk(chunk)
                ai_results.append(ai_response)
            
            # Merge results
            final_result = merge_results(ai_results, local_result)
            
            return jsonify({
                "message": "Test EDI specification analysis completed",
                "sample_lines": sample_lines,
                "total_lines": len(sample_lines),
                "chunks_processed": len(chunks),
                "local_result": local_result,
                "ai_results": ai_results,
                "final_result": final_result
            })
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route('/debug-filter', methods=['POST'])
    def debug_filter():
        """Debug endpoint to see what lines are being filtered"""
        try:
            if 'pdf' not in request.files:
                return jsonify({"error": "PDF file required in 'pdf' field"}), 400
            
            pdf_file = request.files['pdf']
            if pdf_file.filename == '' or not pdf_file.filename.lower().endswith('.pdf'):
                return jsonify({"error": "Invalid PDF file"}), 400
            
            # Extract PDF text
            pdf_text = extract_pdf_text(pdf_file)
            all_lines = [line.strip() for line in pdf_text.splitlines() if line.strip()]
            
            # Filter lines
            filtered_lines = filter_edi_lines(pdf_text)
            
            # Show which segments were found
            segments_found = set()
            for line in filtered_lines:
                line_upper = line.upper()
                for seg in EDI_SEGMENTS:
                    if (line_upper.startswith(seg + ' ') or 
                        ' ' + seg + ' ' in line_upper or
                        seg + '01' in line_upper or
                        seg + '02' in line_upper):
                        segments_found.add(seg)
            
            return jsonify({
                "total_lines_in_pdf": len(all_lines),
                "filtered_lines_count": len(filtered_lines),
                "filtered_lines": filtered_lines[:20],  # Show first 20 for debugging
                "segments_found": sorted(list(segments_found)),
                "missing_segments": sorted(list(set(EDI_SEGMENTS) - segments_found))
            })
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route('/analyze-spec', methods=['POST'])
    def analyze_spec():
        try:
            # Check if PDF file is provided
            if 'pdf' not in request.files:
                return jsonify({"error": "PDF file required in 'pdf' field"}), 400
            
            pdf_file = request.files['pdf']
            if pdf_file.filename == '' or not pdf_file.filename.lower().endswith('.pdf'):
                return jsonify({"error": "Invalid PDF file"}), 400
            
            # Check if EDI data TXT file is provided
            edi_segments_present = []
            edi_elements_data = []
            if 'edi_data' in request.files:
                edi_file = request.files['edi_data']
                if edi_file.filename != '' and edi_file.filename.lower().endswith('.txt'):
                    # Read EDI data from TXT file
                    edi_data = edi_file.read().decode('utf-8').strip()
                    if edi_data:
                        # Extract segment tags from EDI data
                        edi_lines = edi_data.splitlines()
                        for line in edi_lines:
                            line = line.strip()
                            if line and '*' in line:
                                segment_tag = line.split('*')[0]
                                if segment_tag and segment_tag not in edi_segments_present:
                                    edi_segments_present.append(segment_tag)
                        
                        # Parse EDI elements
                        edi_elements_data = parse_edi_elements(edi_data)
            
            # Extract and filter PDF text
            pdf_text = extract_pdf_text(pdf_file)
            filtered_lines = filter_edi_lines(pdf_text)
            
            if not filtered_lines:
                return jsonify({"error": "No EDI specification lines found in PDF"}), 400
            
            # Build local fallback result
            local_result = build_local_segment_dict(filtered_lines)
            
            # Process in chunks with AI
            ai_results = []
            chunks = list(chunk_iter(filtered_lines, 5))
            
            for chunk in chunks:
                ai_response = call_ai_endpoint_chunk(chunk)
                ai_results.append(ai_response)
            
            # Merge AI results with local fallback
            final_result = merge_results(ai_results, local_result)
            
            # Create tabular data for display
            tabular_data = []
            for segment, spec in final_result.items():
                is_present = segment in edi_segments_present
                tabular_data.append({
                    "segment_tag": segment,
                    "x12_requirement": spec.get("x12_requirement", "unknown"),
                    "company_usage": spec.get("company_usage", "unknown"),
                    "min_usage": spec.get("min_usage", "N/A"),
                    "max_usage": spec.get("max_usage", "N/A"),
                    "present_in_edi": is_present,
                    "status": "✓ Present" if is_present else "✗ Missing"
                })
            
            # Sort by segment tag for better presentation
            tabular_data.sort(key=lambda x: x["segment_tag"])
            
            return jsonify({
                "message": "EDI specification analysis completed",
                "total_lines": len(filtered_lines),
                "chunks_processed": len(chunks),
                "segments_in_edi": edi_segments_present,
                "segment_specifications": final_result,
                "tabular_data": tabular_data,
                "edi_elements": edi_elements_data,
                "total_elements": len(edi_elements_data)
            })
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500

   # add end poit which accepts pdf and parse it 

    # Single endpoint to handle both TXT file (EDI data) and PDF file (specification)
    @app.route('/validate-complete', methods=['POST'])
    def validate_complete():
        try:
            # Check if PDF specification file is provided
            if 'pdf_file' not in request.files:
                return jsonify({"error": "No PDF specification file provided"}), 400
            
            pdf_file = request.files['pdf_file']
            if pdf_file.filename == '' or not pdf_file.filename.lower().endswith('.pdf'):
                return jsonify({"error": "Invalid PDF file"}), 400
            
            # Check if TXT EDI data file is provided
            if 'txt_file' not in request.files:
                return jsonify({"error": "No TXT EDI data file provided"}), 400
            
            txt_file = request.files['txt_file']
            if txt_file.filename == '' or not txt_file.filename.lower().endswith('.txt'):
                return jsonify({"error": "Invalid TXT file"}), 400
            
            # Read EDI data from TXT file
            edi_data = txt_file.read().decode('utf-8').strip()
            if not edi_data:
                return jsonify({"error": "TXT file is empty or contains no EDI data"}), 400
            
            #parse pdf line by line 
            def extract_pdf_text(pdf_file):
                pdf_text = ""
                with pdfplumber.open(pdf_file) as pdf:
                    for page in pdf.pages:
                        pdf_text += page.extract_text() + "\n"
                return pdf_text

            pdf_text = extract_pdf_text(pdf_file)

            # read text file line by line
            edi_lines = edi_data.splitlines()
            edi_segments = [line for line in edi_lines if line.strip()]
            segment_tags = [line.split('*')[0] for line in edi_segments if '*' in line]

            pdf_lines = pdf_text.splitlines()
            pdf_segments = [line for line in pdf_lines if line.strip()]


            return jsonify({
                "message": "Complete EDI validation completed successfully",
                "validation_results": pdf_segments
            }), 200
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500


    return app
