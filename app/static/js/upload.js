// Upload page specific functionality
let currentTableData = [];
let filteredTableData = [];
let currentElementsData = [];
let filteredElementsData = [];
let sortDirection = {};
let elementsSortDirection = {};

// Search functionality
function searchSegments() {
    const searchTerm = document.getElementById('segment-search').value.toLowerCase();
    filterAndDisplayTable(searchTerm);
}

function clearSearch() {
    document.getElementById('segment-search').value = '';
    document.getElementById('requirement-filter').value = '';
    document.getElementById('usage-filter').value = '';
    document.getElementById('presence-filter').value = '';
    filterAndDisplayTable('');
}

function filterTable() {
    const searchTerm = document.getElementById('segment-search').value.toLowerCase();
    filterAndDisplayTable(searchTerm);
}

function filterAndDisplayTable(searchTerm = '') {
    const requirementFilter = document.getElementById('requirement-filter').value;
    const usageFilter = document.getElementById('usage-filter').value;
    const presenceFilter = document.getElementById('presence-filter').value;
    
    filteredTableData = currentTableData.filter(row => {
        // Text search
        const matchesSearch = searchTerm === '' || 
            row.segment_tag.toLowerCase().includes(searchTerm) ||
            row.x12_requirement.toLowerCase().includes(searchTerm) ||
            row.company_usage.toLowerCase().includes(searchTerm) ||
            row.status.toLowerCase().includes(searchTerm);
        
        // Requirement filter
        const matchesRequirement = requirementFilter === '' || 
            row.x12_requirement === requirementFilter;
        
        // Usage filter
        const matchesUsage = usageFilter === '' || 
            row.company_usage === usageFilter;
        
        // Presence filter
        const matchesPresence = presenceFilter === '' ||
            (presenceFilter === 'present' && row.present_in_edi) ||
            (presenceFilter === 'missing' && !row.present_in_edi);
        
        return matchesSearch && matchesRequirement && matchesUsage && matchesPresence;
    });
    
    populateTable(filteredTableData);
    updateTableCount();
}

function updateTableCount() {
    const countElement = document.getElementById('table-count');
    if (countElement) {
        countElement.textContent = `Showing ${filteredTableData.length} of ${currentTableData.length} segments`;
    }
}

function sortTable(columnIndex) {
    const columnNames = ['segment_tag', 'x12_requirement', 'company_usage', 'min_usage', 'max_usage', 'present_in_edi', 'status'];
    const columnName = columnNames[columnIndex];
    
    // Toggle sort direction
    sortDirection[columnName] = sortDirection[columnName] === 'asc' ? 'desc' : 'asc';
    
    filteredTableData.sort((a, b) => {
        let aVal = a[columnName];
        let bVal = b[columnName];
        
        // Handle different data types
        if (columnName === 'min_usage' || columnName === 'max_usage') {
            aVal = aVal === 'N/A' ? -1 : parseInt(aVal);
            bVal = bVal === 'N/A' ? -1 : parseInt(bVal);
        } else if (columnName === 'present_in_edi') {
            aVal = aVal ? 1 : 0;
            bVal = bVal ? 1 : 0;
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }
        
        if (sortDirection[columnName] === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
    
    populateTable(filteredTableData);
    updateSortIcons(columnIndex);
}

function updateSortIcons(activeColumn) {
    const headers = document.querySelectorAll('#segment-table th i');
    headers.forEach((icon, index) => {
        icon.className = 'fas fa-sort';
        if (index === activeColumn) {
            const columnNames = ['segment_tag', 'x12_requirement', 'company_usage', 'min_usage', 'max_usage', 'present_in_edi', 'status'];
            const direction = sortDirection[columnNames[activeColumn]];
            icon.className = direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

function populateTable(data) {
    const tableBody = document.getElementById('segment-table-body');
    tableBody.innerHTML = '';
    
    data.forEach(row => {
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
}

function showTabularResults(tabularData) {
    currentTableData = tabularData;
    filteredTableData = [...tabularData];
    
    const tabularContainer = document.getElementById('tabular-results');
    const searchSection = document.getElementById('search-section');
    
    // Show search section and populate table
    searchSection.style.display = 'block';
    populateTable(filteredTableData);
    updateTableCount();
    
    // Show the tabular results container
    tabularContainer.style.display = 'block';
    
    // Scroll to search section
    searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideTabularResults() {
    document.getElementById('tabular-results').style.display = 'none';
    document.getElementById('search-section').style.display = 'none';
    currentTableData = [];
    filteredTableData = [];
}

// EDI Elements Table Functions
function showElementsResults(elementsData) {
    currentElementsData = elementsData;
    filteredElementsData = [...elementsData];
    
    const elementsContainer = document.getElementById('elements-results');
    
    // Populate filter dropdowns
    populateElementsFilters(elementsData);
    
    // Populate table
    populateElementsTable(filteredElementsData);
    updateElementsCount();
    
    // Show the elements results container
    elementsContainer.style.display = 'block';
    
    // Scroll to elements results
    elementsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateElementsFilters(elementsData) {
    const segmentFilter = document.getElementById('segment-filter');
    const lineFilter = document.getElementById('line-filter');
    
    // Get unique segments and lines
    const segments = [...new Set(elementsData.map(el => el.segment_tag))].sort();
    const lines = [...new Set(elementsData.map(el => el.line_number))].sort((a, b) => a - b);
    
    // Populate segment filter
    segmentFilter.innerHTML = '<option value="">All Segments</option>';
    segments.forEach(segment => {
        const option = document.createElement('option');
        option.value = segment;
        option.textContent = segment;
        segmentFilter.appendChild(option);
    });
    
    // Populate line filter
    lineFilter.innerHTML = '<option value="">All Lines</option>';
    lines.forEach(line => {
        const option = document.createElement('option');
        option.value = line;
        option.textContent = `Line ${line}`;
        lineFilter.appendChild(option);
    });
}

function searchElements() {
    const searchTerm = document.getElementById('elements-search').value.toLowerCase();
    filterAndDisplayElementsTable(searchTerm);
}

function clearElementsSearch() {
    document.getElementById('elements-search').value = '';
    document.getElementById('segment-filter').value = '';
    document.getElementById('line-filter').value = '';
    filterAndDisplayElementsTable('');
}

function filterElementsTable() {
    const searchTerm = document.getElementById('elements-search').value.toLowerCase();
    filterAndDisplayElementsTable(searchTerm);
}

function filterAndDisplayElementsTable(searchTerm = '') {
    const segmentFilter = document.getElementById('segment-filter').value;
    const lineFilter = document.getElementById('line-filter').value;
    
    filteredElementsData = currentElementsData.filter(row => {
        // Text search
        const matchesSearch = searchTerm === '' || 
            row.segment_tag.toLowerCase().includes(searchTerm) ||
            row.element_position.toLowerCase().includes(searchTerm) ||
            row.element_code.toLowerCase().includes(searchTerm) ||
            row.element_value.toLowerCase().includes(searchTerm) ||
            row.element_description.toLowerCase().includes(searchTerm);
        
        // Segment filter
        const matchesSegment = segmentFilter === '' || row.segment_tag === segmentFilter;
        
        // Line filter
        const matchesLine = lineFilter === '' || row.line_number.toString() === lineFilter;
        
        return matchesSearch && matchesSegment && matchesLine;
    });
    
    populateElementsTable(filteredElementsData);
    updateElementsCount();
}

function updateElementsCount() {
    const countElement = document.getElementById('elements-count');
    if (countElement) {
        countElement.textContent = `Showing ${filteredElementsData.length} of ${currentElementsData.length} elements`;
    }
}

function sortElementsTable(columnIndex) {
    const columnNames = ['line_number', 'segment_tag', 'element_position', 'element_code', 'element_value', 'element_description'];
    const columnName = columnNames[columnIndex];
    
    // Toggle sort direction
    elementsSortDirection[columnName] = elementsSortDirection[columnName] === 'asc' ? 'desc' : 'asc';
    
    filteredElementsData.sort((a, b) => {
        let aVal = a[columnName];
        let bVal = b[columnName];
        
        // Handle different data types
        if (columnName === 'line_number') {
            aVal = parseInt(aVal);
            bVal = parseInt(bVal);
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }
        
        if (elementsSortDirection[columnName] === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
    
    populateElementsTable(filteredElementsData);
    updateElementsSortIcons(columnIndex);
}

function updateElementsSortIcons(activeColumn) {
    const headers = document.querySelectorAll('#elements-table th i');
    headers.forEach((icon, index) => {
        icon.className = 'fas fa-sort';
        if (index === activeColumn) {
            const columnNames = ['line_number', 'segment_tag', 'element_position', 'element_code', 'element_value', 'element_description'];
            const direction = elementsSortDirection[columnNames[activeColumn]];
            icon.className = direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

function populateElementsTable(data) {
    const tableBody = document.getElementById('elements-table-body');
    tableBody.innerHTML = '';
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Helper function to create cells
        const createCell = (content, className = '') => {
            const td = document.createElement('td');
            if (className) {
                td.className = className;
            }
            td.textContent = content;
            return td;
        };
        
        // Line Number
        tr.appendChild(createCell(row.line_number, 'line-number-cell'));
        
        // Segment Tag
        tr.appendChild(createCell(row.segment_tag, 'segment-tag-cell'));
        
        // Element Position
        tr.appendChild(createCell(row.element_position, 'element-position-cell'));
        
        // Element Code
        tr.appendChild(createCell(row.element_code, 'element-code-cell'));
        
        // Element Value
        const valueClass = row.element_value === '(empty)' ? 'empty-value' : 'element-value';
        tr.appendChild(createCell(row.element_value, valueClass));
        
        // Description
        tr.appendChild(createCell(row.element_description, 'element-description'));
        
        tableBody.appendChild(tr);
    });
}

function hideElementsResults() {
    document.getElementById('elements-results').style.display = 'none';
    currentElementsData = [];
    filteredElementsData = [];
}

function exportElementsTable() {
    if (filteredElementsData.length === 0) {
        alert('No elements data to export');
        return;
    }
    
    // Create CSV content
    const headers = ['Line #', 'Segment', 'Position', 'Element Code', 'Value', 'Description'];
    const csvContent = [
        headers.join(','),
        ...filteredElementsData.map(row => [
            row.line_number,
            row.segment_tag,
            row.element_position,
            row.element_code,
            `"${row.element_value}"`, // Quote values that might contain commas
            `"${row.element_description}"`
        ].join(','))
    ].join('\\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edi-elements-breakdown-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function hideTabularResults() {
    document.getElementById('tabular-results').style.display = 'none';
    document.getElementById('search-section').style.display = 'none';
    currentTableData = [];
    filteredTableData = [];
}

function exportTable() {
    if (filteredTableData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV content
    const headers = ['Segment Tag', 'X12 Requirement', 'Company Usage', 'Min Usage', 'Max Usage', 'Present in EDI', 'Status'];
    const csvContent = [
        headers.join(','),
        ...filteredTableData.map(row => [
            row.segment_tag,
            row.x12_requirement,
            row.company_usage,
            row.min_usage || 'N/A',
            row.max_usage || 'N/A',
            row.present_in_edi ? 'Yes' : 'No',
            row.status
        ].join(','))
    ].join('\\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edi-segment-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Override the showResults function to work with the new layout
function showResults(data) {
    const resultsContainer = document.getElementById('results');
    const resultsJson = document.getElementById('results-json');
    
    resultsJson.textContent = JSON.stringify(data, null, 2);
    resultsContainer.style.display = 'block';
    
    // If tabular data is available, show the table
    if (data.tabular_data && Array.isArray(data.tabular_data)) {
        showTabularResults(data.tabular_data);
    }
    
    // If EDI elements data is available, show the elements table
    if (data.edi_elements && Array.isArray(data.edi_elements) && data.edi_elements.length > 0) {
        showElementsResults(data.edi_elements);
    }
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Initialize search functionality when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for real-time search
    const searchInput = document.getElementById('segment-search');
    if (searchInput) {
        searchInput.addEventListener('input', searchSegments);
    }
});