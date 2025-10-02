// Mobile Navigation
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }));
}

// Smooth scrolling for internal links
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        const headerOffset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
}

// File upload handlers
document.getElementById('pdf-upload')?.addEventListener('change', function(e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'No PDF file selected';
    document.getElementById('pdf-file-name').textContent = fileName;
});

document.getElementById('edi-upload')?.addEventListener('change', function(e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'No EDI file selected';
    document.getElementById('edi-file-name').textContent = fileName;
});

document.getElementById('debug-upload')?.addEventListener('change', function(e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'No file selected';
    document.getElementById('debug-file-name').textContent = fileName;
});

// API Functions
const API_BASE = window.location.origin;

function showLoading(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="loading"></span> Processing...';
    button.disabled = true;
    return originalText;
}

function hideLoading(button, originalText) {
    button.innerHTML = originalText;
    button.disabled = false;
}

function showTabularResults(tabularData) {
    const tabularContainer = document.getElementById('tabular-results');
    const tableBody = document.getElementById('segment-table-body');
    
    // Clear existing table rows
    tableBody.innerHTML = '';
    
    // Populate table with data
    tabularData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Helper function to create styled cells
        const createCell = (content, className = '') => {
            const td = document.createElement('td');
            if (className) {
                td.className = className;
            }
            td.textContent = content;
            return td;
        };
        
        // Segment Tag
        const segmentCell = createCell(row.segment_tag, 'segment-tag-cell');
        tr.appendChild(segmentCell);
        
        // X12 Requirement
        const reqClass = row.x12_requirement === 'mandatory' ? 'requirement-mandatory' : 'requirement-optional';
        const reqCell = createCell(row.x12_requirement, reqClass);
        tr.appendChild(reqCell);
        
        // Company Usage
        let usageClass = '';
        switch(row.company_usage) {
            case 'must_use': usageClass = 'usage-must-use'; break;
            case 'used': usageClass = 'usage-used'; break;
            case 'conditional': usageClass = 'usage-conditional'; break;
            case 'not_used': usageClass = 'usage-not-used'; break;
        }
        const usageCell = createCell(row.company_usage, usageClass);
        tr.appendChild(usageCell);
        
        // Min Usage
        tr.appendChild(createCell(row.min_usage || 'N/A'));
        
        // Max Usage
        tr.appendChild(createCell(row.max_usage || 'N/A'));
        
        // Present in EDI
        tr.appendChild(createCell(row.present_in_edi ? 'Yes' : 'No'));
        
        // Status
        const statusClass = row.present_in_edi ? 'status-present' : 'status-missing';
        tr.appendChild(createCell(row.status, statusClass));
        
        tableBody.appendChild(tr);
    });
    
    // Show the tabular results container
    tabularContainer.style.display = 'block';
    
    // Scroll to tabular results
    tabularContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideTabularResults() {
    document.getElementById('tabular-results').style.display = 'none';
}

function showResults(data) {
    const resultsContainer = document.getElementById('results');
    const resultsJson = document.getElementById('results-json');
    
    resultsJson.textContent = JSON.stringify(data, null, 2);
    resultsContainer.style.display = 'block';
    
    // If tabular data is available, show the table
    if (data.tabular_data && Array.isArray(data.tabular_data)) {
        showTabularResults(data.tabular_data);
    }
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideResults() {
    document.getElementById('results').style.display = 'none';
}

async function analyzePDF() {
    const pdfInput = document.getElementById('pdf-upload');
    const ediInput = document.getElementById('edi-upload');
    const button = event.target;
    
    if (!pdfInput.files[0]) {
        alert('Please select a PDF specification file first');
        return;
    }
    
    const originalText = showLoading(button);
    
    try {
        const formData = new FormData();
        formData.append('pdf', pdfInput.files[0]);
        
        // Add EDI data file if selected
        if (ediInput.files[0]) {
            formData.append('edi_data', ediInput.files[0]);
        }
        
        const response = await fetch(`${API_BASE}/analyze-spec`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        showResults(data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Analysis failed');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showResults({
            error: error.message,
            message: 'Failed to analyze files. Please check the files and try again.'
        });
    } finally {
        hideLoading(button, originalText);
    }
}

async function testSample() {
    const button = event.target;
    const originalText = showLoading(button);
    
    try {
        const response = await fetch(`${API_BASE}/test-spec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        showResults(data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Test failed');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showResults({
            error: error.message,
            message: 'Failed to run test sample. Please try again.'
        });
    } finally {
        hideLoading(button, originalText);
    }
}

async function debugFilter() {
    const fileInput = document.getElementById('debug-upload');
    const button = event.target;
    
    if (!fileInput.files[0]) {
        alert('Please select a PDF file first');
        return;
    }
    
    const originalText = showLoading(button);
    
    try {
        const formData = new FormData();
        formData.append('pdf', fileInput.files[0]);
        
        const response = await fetch(`${API_BASE}/debug-filter`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        showResults(data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Debug failed');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showResults({
            error: error.message,
            message: 'Failed to debug filter. Please check the file and try again.'
        });
    } finally {
        hideLoading(button, originalText);
    }
}

// Navbar background change on scroll
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (header) {
        if (window.scrollY > 100) {
            header.style.backgroundColor = 'rgba(102, 126, 234, 0.95)';
            header.style.backdropFilter = 'blur(10px)';
        } else {
            header.style.backgroundColor = '';
            header.style.backdropFilter = '';
        }
    }
});

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.about-card, .feature-card, .api-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Copy to clipboard function for API endpoints
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show temporary success message
        const toast = document.createElement('div');
        toast.textContent = 'Copied to clipboard!';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 500;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    });
}

// Add click listeners to endpoint spans
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.endpoint').forEach(el => {
        el.style.cursor = 'pointer';
        el.title = 'Click to copy';
        el.addEventListener('click', () => {
            copyToClipboard(el.textContent);
        });
    });
});

// Error handling for network issues
window.addEventListener('online', () => {
    console.log('Connection restored');
});

window.addEventListener('offline', () => {
    console.log('Connection lost');
    showResults({
        error: 'No internet connection',
        message: 'Please check your internet connection and try again.'
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape to close results
    if (e.key === 'Escape') {
        hideResults();
    }
    
    // Ctrl/Cmd + Enter to run test sample
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        testSample();
    }
});

// Auto-hide results after successful operation
function autoHideResults(delay = 10000) {
    setTimeout(() => {
        const resultsContainer = document.getElementById('results');
        if (resultsContainer && resultsContainer.style.display !== 'none') {
            resultsContainer.style.opacity = '0.7';
        }
    }, delay);
}