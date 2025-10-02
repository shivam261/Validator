// Upload page specific functionality
let currentTableData = [];
let filteredTableData = [];
let sortDirection = {};

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