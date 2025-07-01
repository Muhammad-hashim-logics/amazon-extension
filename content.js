// FINAL PRODUCTION VERSION - Complete content script with filtered export system

// Platform detection
function getCurrentPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('amazon')) return 'amazon';
    if (hostname.includes('etsy')) return 'etsy';
    return 'unknown';
}

// Multi-platform product ID extraction
function extractProductId(url) {
    const platform = getCurrentPlatform();
    
    if (platform === 'amazon') {
        return extractASIN(url);
    } else if (platform === 'etsy') {
        return extractEtsyListingId(url);
    }
    
    return null;
}

function extractASIN(url) {
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})|\/product\/([A-Z0-9]{10})/i);
    if (!asinMatch) return null;
    return asinMatch[1] || asinMatch[2] || asinMatch[3];
}

function extractEtsyListingId(url) {
    // Etsy URLs format: https://www.etsy.com/listing/123456789/product-name
    const etsyMatch = url.match(/\/listing\/(\d+)/);
    if (!etsyMatch) return null;
    return etsyMatch[1];
}

function findProductElements() {
    const platform = getCurrentPlatform();
    let links = [];
    
    if (platform === 'amazon') {
        links = Array.from(document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/product/"]'));
    } else if (platform === 'etsy') {
        links = Array.from(document.querySelectorAll('a[href*="/listing/"]'));
    }
    
    const seen = new Set();
    return links.filter(link => {
        const productId = extractProductId(link.href);
        if (productId && !seen.has(productId)) {
            seen.add(productId);
            return true;
        }
        return false;
    });
}

// --- Data extraction functions ---
function extractPriceFromDoc(doc) {
    const selectors = ['.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', '.a-price-whole'];
    for (let selector of selectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent.trim()) {
            if (selector === '.a-price-whole') {
                const priceContainer = element.closest('.a-price');
                if (priceContainer) {
                    const symbol = priceContainer.querySelector('.a-price-symbol')?.textContent.trim() || '£';
                    let whole = priceContainer.querySelector('.a-price-whole')?.textContent.trim();
                    const fraction = priceContainer.querySelector('.a-price-fraction')?.textContent.trim();
                    if (whole && fraction) {
                        if (whole.endsWith('.')) { whole = whole.slice(0, -1); }
                        return `${symbol}${whole}.${fraction}`;
                    }
                }
            }
            return element.textContent.trim();
        }
    }
    return '';
}

function extractTitleFromDoc(doc) {
    const titleElement = doc.getElementById('productTitle');
    return titleElement ? titleElement.innerText.trim() : '';
}

function extractDeliveryFromDoc(doc) {
    const boldSelectors = ['b', 'strong', '.a-text-bold'];
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'tomorrow', 'today'];
    for (let selector of boldSelectors) {
        for (let element of doc.querySelectorAll(selector)) {
            const text = element.textContent.toLowerCase().trim();
            if (dayNames.some(day => text.includes(day))) return text;
        }
    }
    return '';
}

function extractBestSellersRankFromDoc(doc) {
    const potentialLabels = doc.querySelectorAll('th, span.a-text-bold');
    for (const label of potentialLabels) {
        if (label.innerText.trim().includes('Best Sellers Rank')) {
            const parentContainer = label.closest('li, tr');
            if (parentContainer) {
                return parentContainer.innerText;
            }
        }
    }
    return '';
}

function extractImageFromDoc(doc) {
    const selectors = [
        '#landingImage',
        '#imgBlkFront', 
        '.a-dynamic-image',
        '[data-a-dynamic-image]',
        '.s-image',
        '.product-image img',
        '.itemPhoto img',
        'img[alt*="product"]'
    ];
    
    for (let selector of selectors) {
        const element = doc.querySelector(selector);
        if (element) {
            let imageUrl = element.src || element.getAttribute('data-src') || element.getAttribute('data-a-dynamic-image');
            
            if (imageUrl && imageUrl.startsWith('{')) {
                try {
                    const imageData = JSON.parse(imageUrl);
                    imageUrl = Object.keys(imageData)[0];
                } catch (e) {
                    // Continue with original URL if JSON parsing fails
                }
            }
            
            if (imageUrl && imageUrl.startsWith('http')) {
                return imageUrl;
            }
        }
    }
    return '';
}

// --- Filter System ---
let currentFilters = {
    listed: 'all',
    price: 'all',
    delivery: 'all'
};

function createFilterPanel() {
    if (document.getElementById('amazon-filter-panel')) return;
    
    const filterPanel = document.createElement('div');
    filterPanel.id = 'amazon-filter-panel';
    filterPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: white;
        border: 2px solid #34a853;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 12px;
        min-width: 320px;
        max-width: 400px;
    `;
    
    filterPanel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; color: #232f3e; border-bottom: 1px solid #eee; padding-bottom: 5px;">
            🔍 Filter Products
            <button id="filter-close-btn" style="float: right; background: none; border: none; font-size: 16px; cursor: pointer;">✕</button>
        </div>
        
        <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; margin-bottom: 5px;">📦 Status Filter:</div>
            <button class="filter-btn" data-filter="listed" data-value="all" style="margin-right: 5px; margin-bottom: 4px;">All</button>
            <button class="filter-btn" data-filter="listed" data-value="listed" style="margin-right: 5px; margin-bottom: 4px;">✅ Listed</button>
            <button class="filter-btn" data-filter="listed" data-value="violation" style="margin-right: 5px; margin-bottom: 4px;">⚠️ Violation</button>
            <button class="filter-btn" data-filter="listed" data-value="to_list" style="margin-right: 5px; margin-bottom: 4px;">📝 To List</button>
            <button class="filter-btn" data-filter="listed" data-value="plain" style="margin-right: 5px; margin-bottom: 4px;">⚫ Plain</button>
            <button class="filter-btn" data-filter="listed" data-value="na" style="margin-right: 5px; margin-bottom: 4px;">❌ N/A</button>
            <button class="filter-btn" data-filter="listed" data-value="not-listed" style="margin-bottom: 4px;">🔄 Unmarked</button>
        </div>
        
        <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; margin-bottom: 5px;">💰 Price Comparison:</div>
            <button class="filter-btn" data-filter="price" data-value="all" style="margin-right: 5px;">All</button>
            <button class="filter-btn" data-filter="price" data-value="cheaper">I'm Cheaper (Red)</button>
            <button class="filter-btn" data-filter="price" data-value="expensive">I'm Expensive (Green)</button>
            <button class="filter-btn" data-filter="price" data-value="same">Same Price (Orange)</button>
        </div>
        
        <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; margin-bottom: 5px;">🚚 Delivery Comparison:</div>
            <button class="filter-btn" data-filter="delivery" data-value="all" style="margin-right: 5px;">All</button>
            <button class="filter-btn" data-filter="delivery" data-value="faster">I'm Faster (Green)</button>
            <button class="filter-btn" data-filter="delivery" data-value="slower">I'm Slower (Red)</button>
            <button class="filter-btn" data-filter="delivery" data-value="same">Same Time (Orange)</button>
        </div>
        
        <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
            <button id="clear-filters-btn" style="background: #f0f2f2; color: #232f3e; border: 1px solid #d5d9d9; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 10px;">Clear All</button>
            <button id="export-filtered-btn" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 10px;">📤 Export Filtered</button>
            <button id="toggle-filter-panel" style="background: #007185; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 11px;">Hide Panel</button>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .filter-btn {
            background: #f0f2f2;
            color: #232f3e;
            border: 1px solid #d5d9d9;
            padding: 6px 10px;
            margin: 2px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        .filter-btn:hover {
            background: #e9ecef;
        }
        .filter-btn.active {
            background: #007185;
            color: white;
            border-color: #007185;
        }
        .product-hidden {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(filterPanel);
    
    filterPanel.addEventListener('click', function(e) {
        if (e.target.classList.contains('filter-btn')) {
            const filterType = e.target.dataset.filter;
            const filterValue = e.target.dataset.value;
            
            filterPanel.querySelectorAll(`[data-filter="${filterType}"]`).forEach(btn => {
                btn.classList.remove('active');
            });
            e.target.classList.add('active');
            
            currentFilters[filterType] = filterValue;
            applyFilters();
        }
        
        if (e.target.id === 'clear-filters-btn') {
            clearAllFilters();
        }
        
        if (e.target.id === 'export-filtered-btn') {
            exportFilteredProducts();
        }
        
        if (e.target.id === 'toggle-filter-panel') {
            toggleFilterPanel();
        }
        
        if (e.target.id === 'filter-close-btn') {
            filterPanel.style.display = 'none';
        }
    });
    
    updateActiveButtons();
}

function updateActiveButtons() {
    const panel = document.getElementById('amazon-filter-panel');
    if (!panel) return;
    
    Object.entries(currentFilters).forEach(([filterType, value]) => {
        panel.querySelectorAll(`[data-filter="${filterType}"]`).forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.value === value) {
                btn.classList.add('active');
            }
        });
    });
}

function clearAllFilters() {
    currentFilters = {
        listed: 'all',
        price: 'all',
        delivery: 'all'
    };
    updateActiveButtons();
    applyFilters();
}

function toggleFilterPanel() {
    const panel = document.getElementById('amazon-filter-panel');
    const toggleBtn = document.getElementById('toggle-filter-panel');
    
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggleBtn.textContent = 'Hide Panel';
    } else {
        panel.style.display = 'none';
        toggleBtn.textContent = 'Show Filters';
    }
}

function applyFilters() {
    const productElements = findProductElements();
    
    productElements.forEach(link => {
        const productId = extractProductId(link.href);
        if (!productId) return;
        
        const productContainer = findProductContainer(link);
        if (!productContainer) return;
        
        const badges = {
            listed: productContainer.querySelector(`.amazon-listing-checker-badge[data-asin="${productId}"], .amazon-listing-checker-badge[data-listing-id="${productId}"]`),
            price: productContainer.querySelector(`.amazon-price-badge[data-asin="${productId}"], .amazon-price-badge[data-listing-id="${productId}"]`),
            delivery: productContainer.querySelector(`.amazon-delivery-badge[data-asin="${productId}"], .amazon-delivery-badge[data-listing-id="${productId}"]`)
        };
        
        const shouldShow = shouldShowProduct(badges);
        
        if (shouldShow) {
            productContainer.classList.remove('product-hidden');
        } else {
            productContainer.classList.add('product-hidden');
        }
    });
    
    updateFilterStats();
}

function findProductContainer(link) {
    const platform = getCurrentPlatform();
    
    if (platform === 'amazon') {
        // Amazon-specific container detection
        let container = link.closest('[data-component-type="s-search-result"]');
        if (container) return container;
        
        container = link.closest('[data-asin]');
        if (container) return container;
        
        container = link.closest('.s-result-item');
        if (container) return container;
        
        container = link.closest('.a-section');
        if (container) return container;
        
        let parent = link.parentElement;
        while (parent && parent !== document.body) {
            if (parent.querySelector('.amazon-listing-checker-badge') || 
                parent.querySelector('.amazon-price-badge') || 
                parent.querySelector('.amazon-delivery-badge')) {
                return parent;
            }
            parent = parent.parentElement;
        }
        
        return link.parentElement;
    } else if (platform === 'etsy') {
        // Etsy-specific container detection
        let container = link.closest('[data-listing-id]');
        if (container) return container;
        
        container = link.closest('.listing-link');
        if (container) return container;
        
        container = link.closest('.shop-home-organic-result');
        if (container) return container;
        
        container = link.closest('.shop-listing-card');
        if (container) return container;
        
        container = link.closest('.v2-listing-card');
        if (container) return container;
        
        container = link.closest('.organic-impression');
        if (container) return container;
        
        container = link.closest('[data-test-id*="listing"]');
        if (container) return container;
        
        // Look for common Etsy product container patterns
        let parent = link.parentElement;
        while (parent && parent !== document.body) {
            // Check for existing badges
            if (parent.querySelector('.amazon-listing-checker-badge') || 
                parent.querySelector('.amazon-price-badge') || 
                parent.querySelector('.amazon-delivery-badge')) {
                return parent;
            }
            
            // Check for Etsy-specific container classes
            if (parent.classList.contains('listing-card') ||
                parent.classList.contains('shop-listing') ||
                parent.classList.contains('search-result') ||
                parent.classList.contains('listing-card-wrapper') ||
                parent.classList.contains('organic-impression-wrapper')) {
                return parent;
            }
            
            parent = parent.parentElement;
        }
        
        return link.parentElement;
    }
    
    // Fallback for unknown platforms
    return link.parentElement;
}

function shouldShowProduct(badges) {
    if (currentFilters.listed !== 'all') {
        const badgeText = badges.listed ? badges.listed.textContent : '';
        
        switch(currentFilters.listed) {
            case 'listed':
                if (!badgeText.includes('Listed')) return false;
                break;
            case 'violation':
                if (!badgeText.includes('Violation')) return false;
                break;
            case 'to_list':
                if (!badgeText.includes('To List')) return false;
                break;
            case 'plain':
                if (!badgeText.includes('Plain')) return false;
                break;
            case 'na':
                if (!badgeText.includes('N/A')) return false;
                break;
            case 'not-listed':
                if (badgeText.includes('Listed') || badgeText.includes('Violation') || 
                    badgeText.includes('To List') || badgeText.includes('Plain') || 
                    badgeText.includes('N/A')) return false;
                break;
        }
    }
    
    if (currentFilters.price !== 'all' && badges.price) {
        const priceText = badges.price.textContent;
        if (currentFilters.price === 'cheaper' && !priceText.includes('Price-')) return false;
        if (currentFilters.price === 'expensive' && !priceText.includes('Price+')) return false;
        if (currentFilters.price === 'same' && !priceText.includes('Price=')) return false;
    }
    
    if (currentFilters.delivery !== 'all' && badges.delivery) {
        const deliveryText = badges.delivery.textContent;
        if (currentFilters.delivery === 'faster' && !deliveryText.includes('Delivery+')) return false;
        if (currentFilters.delivery === 'slower' && !deliveryText.includes('Delivery-')) return false;
        if (currentFilters.delivery === 'same' && !deliveryText.includes('Delivery=')) return false;
    }
    
    return true;
}

function updateFilterStats() {
    const panel = document.getElementById('amazon-filter-panel');
    if (!panel) return;
    
    const totalProducts = findProductElements().length;
    const platform = getCurrentPlatform();
    
    // Updated to handle both platforms for counting visible products
    let visibleSelectors = [];
    if (platform === 'amazon') {
        visibleSelectors = [
            '[data-component-type="s-search-result"]:not(.product-hidden)',
            '[data-asin]:not(.product-hidden)',
            '.s-result-item:not(.product-hidden)'
        ];
    } else if (platform === 'etsy') {
        visibleSelectors = [
            '[data-listing-id]:not(.product-hidden)',
            '.listing-card:not(.product-hidden)',
            '.shop-listing-card:not(.product-hidden)',
            '.v2-listing-card:not(.product-hidden)',
            '.organic-impression:not(.product-hidden)'
        ];
    }
    
    const visibleProducts = visibleSelectors.reduce((count, selector) => {
        return count + document.querySelectorAll(selector).length;
    }, 0);
    
    const statusCounts = {
        listed: 0,
        violation: 0,
        to_list: 0,
        plain: 0,
        na: 0
    };
    
    // Count badges based on platform
    const badgeSelector = platform === 'amazon' ? 
        '.amazon-listing-checker-badge[data-asin]' : 
        '.amazon-listing-checker-badge[data-listing-id]';
    
    const allBadges = document.querySelectorAll(badgeSelector);
    allBadges.forEach(badge => {
        const text = badge.textContent;
        if (text.includes('Listed')) statusCounts.listed++;
        else if (text.includes('Violation')) statusCounts.violation++;
        else if (text.includes('To List')) statusCounts.to_list++;
        else if (text.includes('Plain')) statusCounts.plain++;
        else if (text.includes('N/A')) statusCounts.na++;
    });
    
    const title = panel.querySelector('div');
    if (title) {
        title.innerHTML = `
            🔍 Filter Products (${visibleProducts}/${totalProducts}) | ✅${statusCounts.listed} ⚠️${statusCounts.violation} 📝${statusCounts.to_list} ⚫${statusCounts.plain} ❌${statusCounts.na}
            <button id="filter-close-btn" style="float: right; background: none; border: none; font-size: 16px; cursor: pointer;">✕</button>
        `;
    }
}

function addFilterToggleButton() {
    if (document.getElementById('filter-toggle-btn')) return;
    
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'filter-toggle-btn';
    toggleBtn.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #007185;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    toggleBtn.textContent = '🔍 Filters';
    
    toggleBtn.addEventListener('click', function() {
        const panel = document.getElementById('amazon-filter-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        } else {
            createFilterPanel();
        }
        toggleBtn.style.display = 'none';
    });
    
    document.body.appendChild(toggleBtn);
}

// --- Export Filtered Products Function ---
function exportFilteredProducts() {
    console.log('Exporting filtered products...');
    
    const visibleProducts = getVisibleFilteredProducts();
    
    if (visibleProducts.length === 0) {
        alert('No products visible with current filters to export.');
        return;
    }
    
    chrome.storage.local.get(['listedData'], function(result) {
        const listedData = result.listedData || {};
        const filteredData = {};
        
        visibleProducts.forEach(productId => {
            if (listedData[productId]) {
                filteredData[productId] = listedData[productId];
            }
        });
        
        if (Object.keys(filteredData).length === 0) {
            alert('No tracked products found in filtered results.');
            return;
        }
        
        showFilteredExportOptions(filteredData, visibleProducts.length);
    });
}

function getVisibleFilteredProducts() {
    const visibleProductIds = [];
    const productElements = findProductElements();
    
    productElements.forEach(link => {
        const productId = extractProductId(link.href);
        if (!productId) return;
        
        const productContainer = findProductContainer(link);
        if (!productContainer) return;
        
        if (!productContainer.classList.contains('product-hidden')) {
            visibleProductIds.push(productId);
        }
    });
    
    return visibleProductIds;
}

function showFilteredExportOptions(filteredData, totalVisibleCount) {
    const existingDialog = document.getElementById('export-options-dialog');
    if (existingDialog) existingDialog.remove();
    
    const dialog = document.createElement('div');
    dialog.id = 'export-options-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #007185;
        border-radius: 12px;
        padding: 25px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 10002;
        font-family: Arial, sans-serif;
        font-size: 14px;
        min-width: 400px;
        max-width: 500px;
    `;
    
    const trackedCount = Object.keys(filteredData).length;
    const filterSummary = getFilterSummary();
    
    dialog.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 15px; color: #232f3e; font-size: 16px; text-align: center;">
            📤 Export Filtered Products
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Current Filter:</div>
            <div style="color: #666; font-size: 13px; margin-bottom: 8px;">${filterSummary}</div>
            <div style="color: #28a745; font-weight: bold;">
                📊 ${totalVisibleCount} products visible | ${trackedCount} tracked products to export
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 10px;">Choose Export Format:</div>
            
            <button id="export-simple-filtered" style="width: 100%; padding: 12px; margin-bottom: 8px; background: #007185; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                📋 Simple Export (Item Link, ASIN, Status, Links, Notes, Image)
            </button>
            
            <button id="export-detailed-filtered" style="width: 100%; padding: 12px; margin-bottom: 8px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                📊 Detailed Export (+ Prices, Delivery, Rankings, Image)
            </button>
        </div>
        
        <div style="text-align: center; padding-top: 15px; border-top: 1px solid #eee;">
            <button id="cancel-export" style="padding: 8px 20px; background: #f0f2f2; border: 1px solid #d5d9d9; border-radius: 4px; cursor: pointer; font-size: 12px;">Cancel</button>
        </div>
    `;
    
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10001;
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    dialog.addEventListener('click', function(e) {
        if (e.target.id === 'export-simple-filtered') {
            buildAndDownloadFilteredCsv(filteredData, 'simple');
            backdrop.remove();
            dialog.remove();
        }
        
        if (e.target.id === 'export-detailed-filtered') {
            buildAndDownloadFilteredCsv(filteredData, 'detailed');
            backdrop.remove();
            dialog.remove();
        }
        
        if (e.target.id === 'cancel-export') {
            backdrop.remove();
            dialog.remove();
        }
    });
    
    backdrop.addEventListener('click', function() {
        backdrop.remove();
        dialog.remove();
    });
}

function getFilterSummary() {
    const parts = [];
    
    if (currentFilters.listed !== 'all') {
        const statusLabels = {
            'listed': '✅ Listed Only',
            'violation': '⚠️ Violations Only',
            'to_list': '📝 To List Only',
            'plain': '⚫ Plain Only',
            'na': '❌ N/A Only',
            'not-listed': '🔄 Unmarked Only'
        };
        parts.push(`Status: ${statusLabels[currentFilters.listed] || currentFilters.listed}`);
    }
    
    if (currentFilters.price !== 'all') {
        const priceLabels = {
            'cheaper': '💰 I\'m Cheaper',
            'expensive': '💰 I\'m More Expensive',
            'same': '💰 Same Price'
        };
        parts.push(`Price: ${priceLabels[currentFilters.price] || currentFilters.price}`);
    }
    
    if (currentFilters.delivery !== 'all') {
        const deliveryLabels = {
            'faster': '🚚 I\'m Faster',
            'slower': '🚚 I\'m Slower',
            'same': '🚚 Same Delivery'
        };
        parts.push(`Delivery: ${deliveryLabels[currentFilters.delivery] || currentFilters.delivery}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'No filters applied (showing all)';
}

async function buildAndDownloadFilteredCsv(filteredData, exportType) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filterSuffix = getFilterSuffix();
    
    const headers = [
        'Item Link',
        'ASIN',
        'Status',
        'My Link',
        'Competitor Link',
        'Notes',
        'Product Image'
    ];
    
    let csvRows = [headers.join(',')];
    
    for (const asin of Object.keys(filteredData)) {
        const item = filteredData[asin];
        const status = item.status || 'no';
        
        const itemLink = item.sellerLink || `https://amazon.com/dp/${asin}`;
        const myLink = item.myLink || '';
        const sellerLink = item.sellerLink || '';
        const notes = item.notes || '';
        const imageUrl = item.csvData?.imageUrl || item.imageUrl || '';
        
        const row = [
            `"${itemLink}"`,
            `"${asin}"`,
            `"${status}"`,
            `"${myLink}"`,
            `"${sellerLink}"`,
            `"${notes}"`,
            `"${imageUrl}"`
        ];
        
        csvRows.push(row.join(','));
    }
    
    downloadFilteredCsv(csvRows.join('\n'), `amazon_filtered_${filterSuffix}_${timestamp}.csv`);
}

function getFilterSuffix() {
    const parts = [];
    
    if (currentFilters.listed !== 'all') {
        parts.push(currentFilters.listed);
    }
    if (currentFilters.price !== 'all') {
        parts.push(currentFilters.price);
    }
    if (currentFilters.delivery !== 'all') {
        parts.push(currentFilters.delivery);
    }
    
    return parts.length > 0 ? parts.join('_') : 'all';
}

function downloadFilteredCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    const exportedCount = csvContent.split('\n').length - 1;
    alert(`Filtered export complete! Exported ${exportedCount} products.\nFile: ${filename}`);
}

function showStatusSelectionMenu(productId, el, allListedData) {
    const existingMenu = document.getElementById('status-selection-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'status-selection-menu';
    menu.style.cssText = `
        position: fixed;
        background: white;
        border: 2px solid #007185;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 13px;
        min-width: 200px;
    `;
    
    menu.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; color: #232f3e; border-bottom: 1px solid #eee; padding-bottom: 5px;">
            Select Status for ${productId}
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="status-option" data-status="listed" style="padding: 8px 12px; border: 1px solid #34a853; background: #e3fcef; color: #155724; border-radius: 4px; cursor: pointer; font-size: 12px;">✅ Listed</button>
            <button class="status-option" data-status="violation" style="padding: 8px 12px; border: 1px solid #721c24; background: #f8d7da; color: #721c24; border-radius: 4px; cursor: pointer; font-size: 12px;">⚠️ Violation</button>
            <button class="status-option" data-status="to_list" style="padding: 8px 12px; border: 1px solid #ffc107; background: #fff3cd; color: #856404; border-radius: 4px; cursor: pointer; font-size: 12px;">📝 To List</button>
            <button class="status-option" data-status="plain" style="padding: 8px 12px; border: 1px solid #6c757d; background: #e2e3e5; color: #495057; border-radius: 4px; cursor: pointer; font-size: 12px;">⚫ Plain</button>
            <button class="status-option" data-status="na" style="padding: 8px 12px; border: 1px solid #dee2e6; background: #f8f9fa; color: #6c757d; border-radius: 4px; cursor: pointer; font-size: 12px;">❌ N/A</button>
        </div>
        <button id="cancel-status" style="width: 100%; margin-top: 10px; padding: 6px; background: #f0f2f2; border: 1px solid #d5d9d9; border-radius: 4px; cursor: pointer; font-size: 11px;">Cancel</button>
    `;
    
    const platform = getCurrentPlatform();
    const dataAttr = platform === 'amazon' ? 'data-asin' : 'data-listing-id';
    const badge = el.parentElement.querySelector(`.amazon-listing-checker-badge[${dataAttr}="${productId}"]`);
    if (badge) {
        const rect = badge.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
    }
    
    document.body.appendChild(menu);
    
    menu.addEventListener('click', function(e) {
        if (e.target.classList.contains('status-option')) {
            const selectedStatus = e.target.dataset.status;
            
            // Capture product image when status is updated
            captureProductImage(productId).then(imageUrl => {
                allListedData[productId] = {
                    status: selectedStatus,
                    myLink: allListedData[productId]?.myLink || '',
                    sellerLink: allListedData[productId]?.sellerLink || '',
                    csvData: allListedData[productId]?.csvData || {},
                    notes: allListedData[productId]?.notes || '',
                    imageUrl: imageUrl || allListedData[productId]?.imageUrl || '',
                    platform: platform
                };
                
                chrome.storage.local.set({ listedData: allListedData }, () => {
                    createOrUpdateBadge(el, productId, selectedStatus, allListedData);
                    menu.remove();
                });
            });
        }
        
        if (e.target.id === 'cancel-status') {
            menu.remove();
        }
    });
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// Function to capture product image from current page or product link
async function captureProductImage(productId) {
    try {
        // First try to get image from current page if we're on the product page
        if (window.location.href.includes(productId)) {
            const imageUrl = extractImageFromDoc(document);
            if (imageUrl) {
                console.log(`Found image on current page for ${productId}: ${imageUrl}`);
                return imageUrl;
            }
        }
        
        // Try to find image from product links on current page
        const productLinks = findProductElements();
        for (const link of productLinks) {
            const linkProductId = extractProductId(link.href);
            if (linkProductId === productId) {
                // Look for images near this product link
                const container = findProductContainer(link);
                if (container) {
                    const platform = getCurrentPlatform();
                    
                    // Try multiple image selectors based on platform
                    let imageSelectors = [];
                    if (platform === 'amazon') {
                        imageSelectors = [
                            'img[src*="amazon"]',
                            'img[data-src*="amazon"]',
                            '.s-image',
                            '.a-dynamic-image',
                            '[data-a-dynamic-image]',
                            'img[alt*="product"]',
                            'img'
                        ];
                    } else if (platform === 'etsy') {
                        imageSelectors = [
                            'img[src*="etsy"]',
                            'img[data-src*="etsy"]',
                            '.listing-card-image img',
                            '.shop-listing-image img',
                            '.listing-image img',
                            'img[alt*="listing"]',
                            'img'
                        ];
                    }
                    
                    for (const selector of imageSelectors) {
                        const img = container.querySelector(selector);
                        if (img) {
                            let imageUrl = img.src || img.getAttribute('data-src') || img.getAttribute('data-a-dynamic-image');
                            
                            // Handle dynamic image data for Amazon
                            if (platform === 'amazon' && imageUrl && imageUrl.startsWith('{')) {
                                try {
                                    const imageData = JSON.parse(imageUrl);
                                    imageUrl = Object.keys(imageData)[0];
                                } catch (e) {
                                    // Continue with original URL if JSON parsing fails
                                }
                            }
                            
                            // Validate image URL based on platform
                            const validUrl = platform === 'amazon' 
                                ? (imageUrl && imageUrl.startsWith('http') && imageUrl.includes('amazon'))
                                : (imageUrl && imageUrl.startsWith('http') && imageUrl.includes('etsy'));
                            
                            if (validUrl) {
                                console.log(`Found image for ${productId}: ${imageUrl}`);
                                return imageUrl;
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`No image found for ${asin}`);
        return '';
    } catch (error) {
        console.error('Error capturing product image:', error);
        return '';
    }
}

async function createOrUpdateBadge(el, productId, status, allListedData) {
    const platform = getCurrentPlatform();
    const dataAttr = platform === 'amazon' ? 'data-asin' : 'data-listing-id';
    
    let existingBadge = el.parentElement.querySelector(`.amazon-listing-checker-badge[${dataAttr}="${productId}"]`);
    let existingPriceBadge = el.parentElement.querySelector(`.amazon-price-badge[${dataAttr}="${productId}"]`);
    let existingDeliveryBadge = el.parentElement.querySelector(`.amazon-delivery-badge[${dataAttr}="${productId}"]`);
    
    if (existingBadge) existingBadge.remove();
    if (existingPriceBadge) existingPriceBadge.remove();
    if (existingDeliveryBadge) existingDeliveryBadge.remove();

    const badge = document.createElement("span");
    badge.className = "amazon-listing-checker-badge";
    badge.setAttribute(dataAttr, productId);
    badge.style.cssText = `margin-left: 6px; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: inline-block; position: relative; user-select: none;`;

    switch(status) {
        case "listed":
            badge.style.background = "#e3fcef";
            badge.style.border = "1px solid #34a853";
            badge.style.color = "#155724";
            badge.innerText = "✅ Listed";
            break;
            
        case "violation":
            badge.style.background = "#f8d7da";
            badge.style.border = "1px solid #721c24";
            badge.style.color = "#721c24";
            badge.innerText = "⚠️ Violation";
            break;
            
        case "to_list":
            badge.style.background = "#fff3cd";
            badge.style.border = "1px solid #ffc107";
            badge.style.color = "#856404";
            badge.innerText = "📝 To List";
            break;
            
        case "plain":
            badge.style.background = "#e2e3e5";
            badge.style.border = "1px solid #6c757d";
            badge.style.color = "#495057";
            badge.innerText = "⚫ Plain";
            break;
            
        case "na":
            badge.style.background = "#f8f9fa";
            badge.style.border = "1px solid #dee2e6";
            badge.style.color = "#6c757d";
            badge.innerText = "❌ N/A";
            break;
            
        default:
            badge.style.background = "#fffbe3";
            badge.style.border = "1px solid #e3b534";
            badge.style.color = "#856404";
            badge.innerText = "Mark as listed?";
            break;
    }
    
    badge.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        showStatusSelectionMenu(productId, el, allListedData);
    });
    
    if (el.parentElement) {
        el.parentElement.insertBefore(badge, el.nextSibling);
    }
}

// --- CSV EXPORT LOGIC ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "exportToCsv") {
        buildAndDownloadCsv(request.data);
        sendResponse({status: "Export process started."});
        return true; 
    }
    
    if (request.action === "exportFilteredProducts") {
        exportFilteredProducts();
        sendResponse({status: "Filtered export process started."});
        return true;
    }
});

async function buildAndDownloadCsv(listedData) {
    const headers = [
        'Item Link',
        'ASIN',
        'Status',
        'My Link',
        'Competitor Link',
        'Notes',
        'Product Image'
    ];
    
    let csvRows = [headers.join(',')];
    const itemsToExport = Object.keys(listedData);
    
    if (itemsToExport.length === 0) {
        alert('No products to export.');
        return;
    }

    for (const asin of itemsToExport) {
        const item = listedData[asin];
        const status = item.status || 'no';
        
        if (status === 'no') continue;

        const itemLink = item.sellerLink || `https://amazon.com/dp/${asin}`;
        const myLink = item.myLink || '';
        const sellerLink = item.sellerLink || '';
        const notes = item.notes || '';
        const imageUrl = item.csvData?.imageUrl || item.imageUrl || '';
        
        const row = [
            `"${itemLink}"`,
            `"${asin}"`,
            `"${status}"`,
            `"${myLink}"`,
            `"${sellerLink}"`,
            `"${notes}"`,
            `"${imageUrl}"`
        ];
        
        csvRows.push(row.join(','));
    }
    
    if (csvRows.length === 1) {
        alert('No products with status to export.');
        return;
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `amazon_status_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    const exportedCount = csvRows.length - 1;
    alert(`Export complete! Exported ${exportedCount} products.`);
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.amazon-listing-checker-badge, #amazon-filter-panel, #status-selection-menu, #export-options-dialog')) {
        const statusMenu = document.getElementById('status-selection-menu');
        if (statusMenu) statusMenu.remove();
        
        const exportDialog = document.getElementById('export-options-dialog');
        if (exportDialog) {
            exportDialog.remove();
            const backdrop = document.querySelector('[style*="position: fixed"][style*="background: rgba(0,0,0,0.5)"]');
            if (backdrop) backdrop.remove();
        }
    }
});

function processAllProducts() {
    chrome.storage.local.get(["listedData"], function(result) {
        const listedData = result.listedData || {};
        let dataUpdated = false;
        
        const processProduct = async (link) => {
            const productId = extractProductId(link.href);
            if (productId) {
                const status = listedData[productId] ? listedData[productId].status : "no";
                
                // Capture image if product is tracked but doesn't have image
                if (listedData[productId] && !listedData[productId].imageUrl) {
                    try {
                        const imageUrl = await captureProductImage(productId);
                        if (imageUrl) {
                            listedData[productId].imageUrl = imageUrl;
                            dataUpdated = true;
                            console.log(`Captured image for ${productId}: ${imageUrl}`);
                        }
                    } catch (error) {
                        console.error(`Error capturing image for ${productId}:`, error);
                    }
                }
                
                const platform = getCurrentPlatform();
                const dataAttr = platform === 'amazon' ? 'data-asin' : 'data-listing-id';
                
                if (!link.parentElement.querySelector(`.amazon-listing-checker-badge[${dataAttr}="${productId}"]`)) {
                    createOrUpdateBadge(link, productId, status, listedData);
                }
            }
        };
        
        // Process all products
        const productLinks = findProductElements();
        Promise.all(productLinks.map(processProduct)).then(() => {
            // Save updated data if images were captured
            if (dataUpdated) {
                chrome.storage.local.set({ listedData: listedData }, () => {
                    console.log('Updated product data with images saved');
                });
            }
        });
        
        setTimeout(() => {
            applyFilters();
        }, 1000);
    });
}

const observer = new MutationObserver(() => { 
    processAllProducts();
});
observer.observe(document.body, { childList: true, subtree: true });

setTimeout(() => {
    processAllProducts();
    addFilterToggleButton();
}, 1500);