document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup script loaded');
    
    // Get all elements
    const listedCountEl = document.getElementById('listedCount');
    const cheaperCountEl = document.getElementById('cheaperCount');
    const expensiveCountEl = document.getElementById('expensiveCount');
    const tableContentEl = document.getElementById('tableContent');
    const refreshBtn = document.getElementById('refreshBtn');
    const exportBtn = document.getElementById('exportBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const extensionStatusEl = document.getElementById('extensionStatus');
    
    // Create import elements if they don't exist
    let importBtn = document.getElementById('importBtn');
    let csvFileInput = document.getElementById('csvFileInput');
    
    if (!importBtn) {
        console.log('Creating import button...');
        const actionsDiv = document.querySelector('.actions');
        if (actionsDiv) {
            importBtn = document.createElement('button');
            importBtn.id = 'importBtn';
            importBtn.className = 'btn btn-secondary';
            importBtn.textContent = '📥 Import CSV';
            
            // Insert before clear button
            if (clearAllBtn) {
                actionsDiv.insertBefore(importBtn, clearAllBtn);
            } else {
                actionsDiv.appendChild(importBtn);
            }
            console.log('Import button created');
        }
    }
    
    if (!csvFileInput) {
        console.log('Creating file input...');
        csvFileInput = document.createElement('input');
        csvFileInput.type = 'file';
        csvFileInput.id = 'csvFileInput';
        csvFileInput.accept = '.csv';
        csvFileInput.style.display = 'none';
        document.body.appendChild(csvFileInput);
        console.log('File input created');
    }

    let productData = {};
    let currentTab = null;

    function checkSupportedPage() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            currentTab = tabs[0];
            const url = tabs[0]?.url;
            const isAmazonPage = url && url.includes('amazon.');
            const isEtsyPage = url && url.includes('etsy.');
            const isSupportedPage = isAmazonPage || isEtsyPage;
            
            let statusText = 'Visit Amazon or Etsy';
            if (isAmazonPage) statusText = 'Active on Amazon';
            else if (isEtsyPage) statusText = 'Active on Etsy';
            
            extensionStatusEl.textContent = statusText;
            extensionStatusEl.style.color = isSupportedPage ? '#34a853' : '#ea4335';
            if (exportBtn) exportBtn.disabled = !isSupportedPage;
            if (refreshBtn) refreshBtn.disabled = !isSupportedPage;
        });
    }

    function createTable() {
        const table = document.createElement('table');
        table.className = 'products-table';
        
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Platform</th>
                    <th>Product ID</th>
                    <th>Status</th>
                    <th>My Link</th>
                    <th>Competitor Link</th>
                    <th>Notes</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody id="tableBody">
            </tbody>
        `;
        
        return table;
    }

    function addProductRow(platform, productId, data, dataKey) {
        const tableBody = document.getElementById('tableBody');
        if (!tableBody) return;

        const row = document.createElement('tr');
        row.setAttribute('data-key', dataKey);
        
        const status = data.status || 'no';
        const statusDisplay = getStatusDisplay(status);
        const platformIcon = platform === 'amazon' ? '🛒' : '🏪';
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        
        row.innerHTML = 
            '<td><span style="font-size: 14px;">' + platformIcon + '</span> ' + platformName + '</td>' +
            '<td><span class="asin-code">' + productId + '</span></td>' +
            '<td><span class="status-badge ' + statusDisplay.class + '">' + statusDisplay.text + '</span></td>' +
            '<td><a href="' + (data.myLink || '#') + '" target="_blank" style="font-size: 10px;">' + (data.myLink ? 'View' : 'N/A') + '</a></td>' +
            '<td><a href="' + (data.sellerLink || '#') + '" target="_blank" style="font-size: 10px;">' + (data.sellerLink ? 'View' : 'N/A') + '</a></td>' +
            '<td style="font-size: 10px; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">' + (data.notes || '') + '</td>' +
            '<td><button class="remove-btn" data-key="' + dataKey + '">✕</button></td>';
        
        tableBody.appendChild(row);
    }

    function getStatusDisplay(status) {
        switch(status) {
            case 'listed':
                return { class: 'status-listed', text: '✅ Listed' };
            case 'violation':
                return { class: 'status-violation', text: '⚠️ Violation' };
            case 'to_list':
                return { class: 'status-to-list', text: '📝 To List' };
            case 'plain':
                return { class: 'status-plain', text: '⚫ Plain' };
            case 'na':
                return { class: 'status-na', text: '❌ N/A' };
            default:
                return { class: 'status-unmarked', text: '🔄 Unmarked' };
        }
    }

    function loadListedProducts() {
        chrome.storage.local.get(['listedData'], function(result) {
            const listedData = result.listedData || {};
            const productCount = Object.keys(listedData).length;
            
            // Update stats
            updateProductStats(listedData);
            
            if (listedCountEl) listedCountEl.textContent = productCount;
            
            productData = {};
            
            if (productCount === 0) {
                if (tableContentEl) tableContentEl.innerHTML = '<div class="empty-state">No products tracked yet</div>';
                return;
            }

            const table = createTable();
            if (tableContentEl) {
                tableContentEl.innerHTML = '';
                tableContentEl.appendChild(table);
            }
            
            Object.entries(listedData).forEach(function(entry) {
                const key = entry[0];
                const data = entry[1];
                
                // Support both old (ASIN only) and new (platform_productId) data structures
                let platform, productId;
                if (key.includes('_')) {
                    // New format: platform_productId
                    [platform, productId] = key.split('_', 2);
                } else {
                    // Old format: assume Amazon ASIN
                    platform = 'amazon';
                    productId = key;
                    // Migrate data to new format
                    const newKey = `${platform}_${productId}`;
                    if (!listedData[newKey]) {
                        listedData[newKey] = { ...data, platform: platform, productId: productId };
                        delete listedData[key];
                    }
                }
                
                productData[key] = data;
                addProductRow(platform, productId, data, key);
            });
            
            // Save migrated data if needed
            chrome.storage.local.set({ listedData: listedData });
        });
            
            // Add click handlers for remove buttons
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    const dataKey = e.target.dataset.key;
                    const displayKey = dataKey.includes('_') ? dataKey.split('_')[1] : dataKey;
                    if (confirm(`Remove ${displayKey} from tracked products?`)) {
                        chrome.storage.local.get(['listedData'], function(result) {
                            const listedData = result.listedData || {};
                            delete listedData[dataKey];
                            chrome.storage.local.set({ listedData: listedData }, function() {
                                loadListedProducts();
                            });
                        });
                    }
                });
            });
        });
    }

    function updateProductStats(listedData) {
        const stats = {
            listed: 0,
            violations: 0,
            toList: 0,
            plain: 0,
            na: 0,
            unmarked: 0
        };

        Object.values(listedData).forEach(function(data) {
            switch(data.status) {
                case 'listed':
                    stats.listed++;
                    break;
                case 'violation':
                    stats.violations++;
                    break;
                case 'to_list':
                    stats.toList++;
                    break;
                case 'plain':
                    stats.plain++;
                    break;
                case 'na':
                    stats.na++;
                    break;
                default:
                    stats.unmarked++;
            }
        });

        if (cheaperCountEl) cheaperCountEl.textContent = stats.listed;
        if (expensiveCountEl) expensiveCountEl.textContent = stats.violations;
    }

    // Enhanced ASIN extraction function
    function extractASINFromURL(url) {
        if (!url) return null;
        const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})|\/product\/([A-Z0-9]{10})/i);
        if (!asinMatch) return null;
        return asinMatch[1] || asinMatch[2] || asinMatch[3];
    }

    // Enhanced status mapping function
    function mapStatusToExtension(csvStatus) {
        if (!csvStatus) return 'plain';
        
        const status = csvStatus.toString().toLowerCase().trim();
        
        // Handle various status formats
        switch(status) {
            case 'yes':
            case 'listed':
            case 'active':
            case 'live':
                return 'listed';
            case 'violation':
            case 'policy violation':
            case 'suspended':
            case 'blocked':
                return 'violation';
            case 'to list':
            case 'to_list':
            case 'pending':
            case 'draft':
                return 'to_list';
            case 'plain':
            case 'generic':
                return 'plain';
            case 'na':
            case 'n/a':
            case 'not applicable':
                return 'na';
            case 'no':
            case 'not listed':
            case 'inactive':
                return 'no';
            default:
                return 'plain';
        }
    }

    function processCsvFile(file) {
        console.log('Processing CSV file:', file.name);
        const reader = new FileReader();
        reader.onload = function(e) {
            console.log('File read successfully');
            const csv = e.target.result;
            parseCsvAndImport(csv);
        };
        reader.onerror = function(e) {
            console.error('Error reading file:', e);
            alert('Error reading file');
        };
        reader.readAsText(file);
    }

    function parseCsvAndImport(csvText) {
        console.log('Parsing CSV data...');
        try {
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(function(h) { 
                return h.trim().toLowerCase().replace(/"/g, ''); 
            });
            
            console.log('CSV Headers:', headers);
            
            // Enhanced column detection
            const columnMap = findColumns(headers);
            console.log('Detected columns:', columnMap);
            
            if (!columnMap.hasASINSource) {
                alert('CSV must have either an ASIN column or a link column (MyLink/CompetitorLink) containing Amazon URLs');
                return;
            }
            
            const newData = {};
            let importCount = 0;
            const errors = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const columns = parseCSVLine(line);
                if (columns.length < headers.length) {
                    console.log('Skipping incomplete line:', i + 1);
                    continue;
                }
                
                try {
                    const result = processCSVRow(columns, columnMap, i + 1);
                    if (result.asin) {
                        newData[result.asin] = result.data;
                        importCount++;
                        console.log(`Imported: ${result.asin} with status: ${result.data.status}`);
                    } else if (result.error) {
                        errors.push(`Row ${i + 1}: ${result.error}`);
                    }
                } catch (error) {
                    errors.push(`Row ${i + 1}: ${error.message}`);
                    console.error(`Error processing row ${i + 1}:`, error);
                }
            }
            
            console.log('Total products to import:', importCount);
            
            if (importCount === 0) {
                let errorMessage = 'No valid products found in CSV.';
                if (errors.length > 0) {
                    errorMessage += '\n\nErrors encountered:\n' + errors.slice(0, 5).join('\n');
                    if (errors.length > 5) {
                        errorMessage += `\n... and ${errors.length - 5} more errors`;
                    }
                }
                alert(errorMessage);
                return;
            }
            
            // Show import preview
            showImportPreview(newData, importCount, errors);
            
        } catch (error) {
            console.error('Error parsing CSV:', error);
            alert('Error parsing CSV file: ' + error.message);
        }
    }

    function findColumns(headers) {
        const columnMap = {
            asin: -1,
            status: -1,
            myLink: -1,
            competitorLink: -1,
            notes: -1,
            hasASINSource: false
        };

        headers.forEach((header, index) => {
            switch(header) {
                case 'asin':
                    columnMap.asin = index;
                    columnMap.hasASINSource = true;
                    break;
                case 'status':
                    columnMap.status = index;
                    break;
                case 'mylink':
                case 'my link':
                    columnMap.myLink = index;
                    columnMap.hasASINSource = true;
                    break;
                case 'competitorlink':
                case 'competitor link':
                case 'sellerlink':
                case 'seller link':
                    columnMap.competitorLink = index;
                    columnMap.hasASINSource = true;
                    break;
                case 'notes':
                    columnMap.notes = index;
                    break;
            }
        });

        return columnMap;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result.map(cell => cell.replace(/^"|"$/g, ''));
    }

    function processCSVRow(columns, columnMap, rowNumber) {
        let asin = null;
        
        // Try to get ASIN directly first
        if (columnMap.asin >= 0 && columns[columnMap.asin]) {
            asin = columns[columnMap.asin].trim();
            if (asin.length !== 10) {
                asin = null; // Invalid ASIN
            }
        }
        
        // If no direct ASIN, try to extract from links
        if (!asin) {
            const links = [
                columnMap.myLink >= 0 ? columns[columnMap.myLink] : null,
                columnMap.competitorLink >= 0 ? columns[columnMap.competitorLink] : null
            ].filter(Boolean);
            
            for (const link of links) {
                asin = extractASINFromURL(link);
                if (asin) break;
            }
        }
        
        if (!asin) {
            return { error: 'No valid ASIN found' };
        }
        
        const status = columnMap.status >= 0 ? columns[columnMap.status] : '';
        const myLink = columnMap.myLink >= 0 ? columns[columnMap.myLink] : '';
        const competitorLink = columnMap.competitorLink >= 0 ? columns[columnMap.competitorLink] : '';
        const notes = columnMap.notes >= 0 ? columns[columnMap.notes] : '';
        
        return {
            asin: asin,
            data: {
                status: mapStatusToExtension(status),
                myLink: myLink || '',
                sellerLink: competitorLink || '',
                notes: notes || '',
                imported: true,
                importDate: new Date().toISOString()
            }
        };
    }

    function showImportPreview(newData, importCount, errors) {
        let message = `⚠️ REPLACE MODE: This will DELETE all existing tracked products!\n\n`;
        message += `Ready to import ${importCount} products (replacing all current data):\n\n`;
        
        // Show sample of products to import
        const sampleASINs = Object.keys(newData).slice(0, 5);
        sampleASINs.forEach(asin => {
            const data = newData[asin];
            message += `• ${asin} - Status: ${data.status}\n`;
        });
        
        if (Object.keys(newData).length > 5) {
            message += `... and ${Object.keys(newData).length - 5} more\n`;
        }
        
        if (errors.length > 0) {
            message += `\n⚠️ ${errors.length} rows had issues and were skipped.\n`;
        }
        
        message += '\n🗑️ ALL EXISTING DATA WILL BE DELETED!\nProceed with REPLACE import?';
        
        if (confirm(message)) {
            performReplaceImport(newData, importCount);
        }
    }

    function performReplaceImport(newData, importCount) {
        // REPLACE MODE: Clear all existing data first, then add new data
        chrome.storage.local.set({ listedData: newData }, function() {
            console.log('All existing data replaced with imported data');
            alert(`Successfully replaced all data with ${importCount} imported products!`);
            loadListedProducts();
            
            // Reload supported platform tab if active
            if (currentTab && currentTab.url && (currentTab.url.includes('amazon.') || currentTab.url.includes('etsy.'))) {
                chrome.tabs.reload(currentTab.id);
            }
        });
    }

    // Event listeners
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            console.log('Refresh clicked');
            loadListedProducts();
            checkSupportedPage();
        });
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            console.log('Export clicked - Starting CSV export...');
            
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].url && (tabs[0].url.includes('amazon.') || tabs[0].url.includes('etsy.'))) {
                    chrome.storage.local.get(['listedData'], function(result) {
                        const listedData = result.listedData || {};
                        
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'exportToCsv',
                            data: listedData
                        }, function(response) {
                            if (chrome.runtime.lastError) {
                                console.error('Export error:', chrome.runtime.lastError);
                                alert('Export failed. Make sure you are on an Amazon page and the extension is loaded.');
                            } else {
                                console.log('Export response:', response);
                            }
                        });
                    });
                } else {
                    alert('Please navigate to an Amazon page to export data.');
                }
            });
        });
    }
    
    if (importBtn) {
        importBtn.addEventListener('click', function() {
            console.log('Import button clicked!');
            if (csvFileInput) {
                csvFileInput.click();
            }
        });
    }
    
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            console.log('Clear all clicked');
            if (confirm('Are you sure you want to clear ALL tracked products?')) {
                chrome.storage.local.set({listedData: {}}, function() {
                    loadListedProducts();
                    
                    // Reload supported platform tab to clear badges
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0] && tabs[0].url && (tabs[0].url.includes('amazon.') || tabs[0].url.includes('etsy.'))) {
                            chrome.tabs.reload(tabs[0].id);
                        }
                    });
                });
            }
        });
    }
    
    if (csvFileInput) {
        csvFileInput.addEventListener('change', function(e) {
            console.log('File input changed');
            const file = e.target.files[0];
            if (file) {
                console.log('File selected:', file.name);
                if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                    processCsvFile(file);
                } else {
                    alert('Please select a valid CSV file');
                }
            }
            csvFileInput.value = '';
        });
    }

    // Initialize
    checkSupportedPage();
    loadListedProducts();
    
    console.log('Popup initialization complete');
});