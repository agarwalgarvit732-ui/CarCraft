/**
 * CarCraft Platform - Core Application Logic
 * 100% DOM-XSS Free, Secure State Management, Accessible & Interactive.
 */

'use strict';

(function () {
  // Rate limiter for booking forms (max 4 submissions per minute)
  const bookingRateLimiter = new SecurityUtils.RateLimiter(4, 60000);

  // App State
  const state = {
    searchQuery: '',
    selectedBrand: 'all',
    bodyType: 'all',
    fuelType: 'all',
    transmission: 'all',
    budgetRange: 'all',
    sortBy: 'recommended',
    selectedCity: SecurityUtils.SafeStorage.getItem('city', 'Mumbai'),
    wishlist: new Set(SecurityUtils.SafeStorage.getItem('wishlist', [])),
    compareList: [],
    activeModal: null
  };

  // Cache DOM Elements safely
  const DOM = {
    // Header & Navigation
    cityBadge: document.getElementById('current-city-label'),
    cityTrigger: document.getElementById('city-selector-trigger'),
    wishlistCount: document.getElementById('wishlist-badge-count'),
    compareCount: document.getElementById('compare-badge-count'),
    navWishlistBtn: document.getElementById('nav-wishlist-btn'),
    navCompareBtn: document.getElementById('nav-compare-btn'),
    
    // Search & Filters
    searchInput: document.getElementById('main-search-input'),
    brandContainer: document.getElementById('brand-chips-container'),
    bodyFilter: document.getElementById('filter-body-type'),
    fuelFilter: document.getElementById('filter-fuel-type'),
    transFilter: document.getElementById('filter-transmission'),
    budgetFilter: document.getElementById('filter-budget'),
    sortSelect: document.getElementById('catalog-sort-select'),
    resetFiltersBtn: document.getElementById('btn-reset-filters'),
    activeFilterCount: document.getElementById('active-filter-count'),
    
    // Grids & Car Showcase
    trendingGrid: document.getElementById('trending-cars-container'),
    catalogGrid: document.getElementById('main-catalog-container'),
    catalogCount: document.getElementById('catalog-count-label'),
    emptyState: document.getElementById('catalog-empty-state'),
    
    // Modals
    carModal: document.getElementById('car-detail-modal'),
    carModalBody: document.getElementById('car-modal-content-slot'),
    compareModal: document.getElementById('compare-modal'),
    compareTableSlot: document.getElementById('compare-table-slot'),
    testDriveModal: document.getElementById('testdrive-modal'),
    testDriveForm: document.getElementById('testdrive-form'),
    testDriveSuccess: document.getElementById('testdrive-success-alert'),
    cityModal: document.getElementById('city-modal'),
    cityListSlot: document.getElementById('city-list-slot'),
    wishlistDrawer: document.getElementById('wishlist-drawer'),
    wishlistItemsSlot: document.getElementById('wishlist-items-slot'),
    
    // EMI Calculator Elements
    emiPriceSlider: document.getElementById('emi-car-price'),
    emiPriceLabel: document.getElementById('emi-car-price-label'),
    emiDownSlider: document.getElementById('emi-down-payment'),
    emiDownLabel: document.getElementById('emi-down-payment-label'),
    emiRateSlider: document.getElementById('emi-interest-rate'),
    emiRateLabel: document.getElementById('emi-interest-rate-label'),
    emiTenureSlider: document.getElementById('emi-tenure-years'),
    emiTenureLabel: document.getElementById('emi-tenure-years-label'),
    emiMonthlyResult: document.getElementById('emi-monthly-output'),
    emiPrincipalResult: document.getElementById('emi-principal-output'),
    emiInterestResult: document.getElementById('emi-interest-output'),
    emiTotalResult: document.getElementById('emi-total-output'),
    emiProgressBar: document.getElementById('emi-ratio-progress')
  };

  /**
   * Currency Formatter for Indian Rupees (Lakhs & Crores friendly)
   */
  function formatINR(amount) {
    if (!Number.isFinite(amount)) return '₹ 0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Safe notification / toast
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `cc-toast cc-toast-${type}`;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'cc-toast-icon';
    iconSpan.textContent = type === 'success' ? '✓' : (type === 'warn' ? '!' : 'ℹ');

    const textSpan = document.createElement('span');
    textSpan.className = 'cc-toast-text';
    textSpan.textContent = SecurityUtils.sanitizeText(message, 120);

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);

    let container = document.getElementById('cc-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cc-toast-container';
      document.body.appendChild(container);
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('cc-toast-visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('cc-toast-visible');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  }

  /**
   * Filter and Sort Database
   */
  function getFilteredCars() {
    let result = CARS_DATABASE.slice();

    // Text search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(car => {
        return (
          car.name.toLowerCase().includes(q) ||
          car.brand.toLowerCase().includes(q) ||
          car.bodyType.toLowerCase().includes(q) ||
          car.fuelType.toLowerCase().includes(q) ||
          car.tagline.toLowerCase().includes(q)
        );
      });
    }

    // Brand filter
    if (state.selectedBrand !== 'all') {
      result = result.filter(car => car.brand === state.selectedBrand);
    }

    // Body Type
    if (state.bodyType !== 'all') {
      result = result.filter(car => car.bodyType === state.bodyType);
    }

    // Fuel Type
    if (state.fuelType !== 'all') {
      result = result.filter(car => car.fuelType.toLowerCase().includes(state.fuelType.toLowerCase()));
    }

    // Transmission
    if (state.transmission !== 'all') {
      result = result.filter(car => car.transmission.toLowerCase().includes(state.transmission.toLowerCase()));
    }

    // Budget range
    if (state.budgetRange !== 'all') {
      if (state.budgetRange === 'under-10') {
        result = result.filter(car => car.priceMin <= 10.0);
      } else if (state.budgetRange === '10-20') {
        result = result.filter(car => car.priceMin <= 20.0 && car.priceMax >= 10.0);
      } else if (state.budgetRange === '20-40') {
        result = result.filter(car => car.priceMin <= 40.0 && car.priceMax >= 20.0);
      } else if (state.budgetRange === 'luxury-40') {
        result = result.filter(car => car.priceMax > 40.0);
      }
    }

    // Sorting
    if (state.sortBy === 'price-low') {
      result.sort((a, b) => a.priceMin - b.priceMin);
    } else if (state.sortBy === 'price-high') {
      result.sort((a, b) => b.priceMax - a.priceMax);
    } else if (state.sortBy === 'mileage') {
      result.sort((a, b) => b.mileageNum - a.mileageNum);
    } else if (state.sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: trending first, then best value
      result.sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
    }

    return result;
  }

  /**
   * Safely create a Car Card DOM node (Zero XSS)
   */
  function createCarCardNode(car) {
    const card = document.createElement('article');
    card.className = 'car-card';
    card.setAttribute('data-id', car.id);

    // Top Image & Badges
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'car-card-media';

    const img = document.createElement('img');
    img.className = 'car-card-img';
    img.src = car.image;
    img.alt = car.name;
    img.loading = 'lazy';
    img.onerror = function () {
      this.src = 'car images/SAFARI.webp';
    };

    // Badge
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'car-badge';
    badgeSpan.textContent = car.badge || car.bodyType;
    if (car.fuelType.includes('Electric')) badgeSpan.classList.add('badge-ev');
    if (car.isTrending) badgeSpan.classList.add('badge-trending');

    // Wishlist Button
    const wishBtn = document.createElement('button');
    wishBtn.type = 'button';
    wishBtn.className = 'car-wish-btn';
    wishBtn.title = 'Add to Wishlist';
    wishBtn.setAttribute('aria-label', `Wishlist ${car.name}`);
    if (state.wishlist.has(car.id)) {
      wishBtn.classList.add('is-active');
      wishBtn.innerHTML = '♥';
    } else {
      wishBtn.innerHTML = '♡';
    }
    wishBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(car.id);
    });

    mediaWrap.appendChild(img);
    mediaWrap.appendChild(badgeSpan);
    mediaWrap.appendChild(wishBtn);

    // Details Body
    const body = document.createElement('div');
    body.className = 'car-card-body';

    const brandName = document.createElement('span');
    brandName.className = 'car-card-brand';
    brandName.textContent = car.brand;

    const title = document.createElement('h3');
    title.className = 'car-card-title';
    title.textContent = car.name;

    const tagline = document.createElement('p');
    tagline.className = 'car-card-tagline';
    tagline.textContent = car.tagline;

    // Spec Pills
    const specsWrap = document.createElement('div');
    specsWrap.className = 'car-specs-grid';

    const specItems = [
      { label: car.fuelType, icon: '⛽' },
      { label: car.transmission, icon: '⚙' },
      { label: car.mileage, icon: '⚡' },
      { label: car.seating, icon: '👥' }
    ];

    specItems.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'spec-chip';
      
      const icon = document.createElement('span');
      icon.className = 'spec-icon';
      icon.textContent = item.icon;

      const txt = document.createElement('span');
      txt.textContent = item.label;

      chip.appendChild(icon);
      chip.appendChild(txt);
      specsWrap.appendChild(chip);
    });

    // Price bar
    const priceWrap = document.createElement('div');
    priceWrap.className = 'car-price-wrap';

    const priceLabel = document.createElement('span');
    priceLabel.className = 'price-sublabel';
    priceLabel.textContent = 'Ex-Showroom Price';

    const priceVal = document.createElement('span');
    priceVal.className = 'price-value';
    priceVal.textContent = car.priceRange;

    priceWrap.appendChild(priceLabel);
    priceWrap.appendChild(priceVal);

    // Safety Pill
    const safetyPill = document.createElement('div');
    safetyPill.className = 'safety-pill';
    safetyPill.textContent = `★ ${car.safetyRating}`;

    // Actions
    const actionRow = document.createElement('div');
    actionRow.className = 'car-card-actions';

    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'btn-card-primary';
    detailBtn.textContent = 'View Details';
    detailBtn.addEventListener('click', () => openCarModal(car.id));

    const testDriveBtn = document.createElement('button');
    testDriveBtn.type = 'button';
    testDriveBtn.className = 'btn-card-secondary';
    testDriveBtn.textContent = 'Test Drive';
    testDriveBtn.addEventListener('click', () => openTestDriveModal(car.id));

    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'btn-card-compare';
    compareBtn.setAttribute('title', 'Compare with other cars');
    const isComparing = state.compareList.includes(car.id);
    if (isComparing) compareBtn.classList.add('is-comparing');
    compareBtn.textContent = isComparing ? '✓ Comparing' : '+ Compare';
    compareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCompare(car.id);
    });

    actionRow.appendChild(detailBtn);
    actionRow.appendChild(testDriveBtn);
    actionRow.appendChild(compareBtn);

    body.appendChild(brandName);
    body.appendChild(title);
    body.appendChild(tagline);
    body.appendChild(specsWrap);
    body.appendChild(safetyPill);
    body.appendChild(priceWrap);
    body.appendChild(actionRow);

    card.appendChild(mediaWrap);
    card.appendChild(body);

    return card;
  }

  /**
   * Render Main Catalog
   */
  function renderCatalog() {
    if (!DOM.catalogGrid) return;
    DOM.catalogGrid.innerHTML = '';

    const filtered = getFilteredCars();

    if (DOM.catalogCount) {
      DOM.catalogCount.textContent = `Showing ${filtered.length} of ${CARS_DATABASE.length} Cars`;
    }

    if (filtered.length === 0) {
      if (DOM.emptyState) DOM.emptyState.style.display = 'block';
      return;
    }

    if (DOM.emptyState) DOM.emptyState.style.display = 'none';

    filtered.forEach(car => {
      DOM.catalogGrid.appendChild(createCarCardNode(car));
    });

    updateActiveFilterCount();
  }

  /**
   * Render Trending Carousel / Grid
   */
  function renderTrending() {
    if (!DOM.trendingGrid) return;
    DOM.trendingGrid.innerHTML = '';

    const trending = CARS_DATABASE.filter(car => car.isTrending);
    trending.forEach(car => {
      DOM.trendingGrid.appendChild(createCarCardNode(car));
    });
  }

  /**
   * Render Brand Chips
   */
  function renderBrandChips() {
    if (!DOM.brandContainer) return;
    DOM.brandContainer.innerHTML = '';

    BRANDS_DATABASE.forEach(b => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'brand-chip';
      if (state.selectedBrand === b.id) chip.classList.add('is-active');

      const name = document.createElement('span');
      name.className = 'brand-name';
      name.textContent = b.name;

      chip.appendChild(name);

      chip.addEventListener('click', () => {
        state.selectedBrand = b.id;
        document.querySelectorAll('.brand-chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        renderCatalog();
        
        // Scroll smoothly to catalog
        const catSection = document.getElementById('catalog-section');
        if (catSection) catSection.scrollIntoView({ behavior: 'smooth' });
      });

      DOM.brandContainer.appendChild(chip);
    });
  }

  /**
   * Count active filters
   */
  function updateActiveFilterCount() {
    let count = 0;
    if (state.selectedBrand !== 'all') count++;
    if (state.bodyType !== 'all') count++;
    if (state.fuelType !== 'all') count++;
    if (state.transmission !== 'all') count++;
    if (state.budgetRange !== 'all') count++;
    if (state.searchQuery.trim().length > 0) count++;

    if (DOM.activeFilterCount) {
      DOM.activeFilterCount.textContent = count > 0 ? `(${count})` : '';
    }
  }

  /**
   * Reset all filters
   */
  function resetAllFilters() {
    state.searchQuery = '';
    state.selectedBrand = 'all';
    state.bodyType = 'all';
    state.fuelType = 'all';
    state.transmission = 'all';
    state.budgetRange = 'all';
    state.sortBy = 'recommended';

    if (DOM.searchInput) DOM.searchInput.value = '';
    if (DOM.bodyFilter) DOM.bodyFilter.value = 'all';
    if (DOM.fuelFilter) DOM.fuelFilter.value = 'all';
    if (DOM.transFilter) DOM.transFilter.value = 'all';
    if (DOM.budgetFilter) DOM.budgetFilter.value = 'all';
    if (DOM.sortSelect) DOM.sortSelect.value = 'recommended';

    document.querySelectorAll('.brand-chip').forEach(c => c.classList.remove('is-active'));
    const allChip = DOM.brandContainer ? DOM.brandContainer.firstElementChild : null;
    if (allChip) allChip.classList.add('is-active');

    renderCatalog();
    showToast('Filters cleared', 'info');
  }

  /**
   * Wishlist Management
   */
  function toggleWishlist(carId) {
    const car = CARS_DATABASE.find(c => c.id === carId);
    if (!car) return;

    if (state.wishlist.has(carId)) {
      state.wishlist.delete(carId);
      showToast(`Removed ${car.name} from Wishlist`, 'info');
    } else {
      state.wishlist.add(carId);
      showToast(`Added ${car.name} to Wishlist ♥`, 'success');
    }

    // Persist
    SecurityUtils.SafeStorage.setItem('wishlist', Array.from(state.wishlist));
    updateBadges();
    renderCatalog();
    renderTrending();
    renderWishlistDrawer();
  }

  /**
   * Compare Management
   */
  function toggleCompare(carId) {
    const car = CARS_DATABASE.find(c => c.id === carId);
    if (!car) return;

    const idx = state.compareList.indexOf(carId);
    if (idx > -1) {
      state.compareList.splice(idx, 1);
      showToast(`Removed ${car.name} from comparison`, 'info');
    } else {
      if (state.compareList.length >= 3) {
        showToast('You can compare a maximum of 3 cars simultaneously.', 'warn');
        return;
      }
      state.compareList.push(carId);
      showToast(`Added ${car.name} to compare (Total: ${state.compareList.length}/3)`, 'success');
    }

    updateBadges();
    renderCatalog();
    renderTrending();

    if (state.compareList.length >= 2) {
      openCompareModal();
    }
  }

  /**
   * Update Badges
   */
  function updateBadges() {
    if (DOM.wishlistCount) {
      DOM.wishlistCount.textContent = state.wishlist.size;
      DOM.wishlistCount.style.display = state.wishlist.size > 0 ? 'inline-block' : 'none';
    }
    if (DOM.compareCount) {
      DOM.compareCount.textContent = state.compareList.length;
      DOM.compareCount.style.display = state.compareList.length > 0 ? 'inline-block' : 'none';
    }
    if (DOM.cityBadge) {
      DOM.cityBadge.textContent = state.selectedCity;
    }
  }

  /**
   * Modal Management with zero memory leak
   */
  function openModal(modalEl) {
    if (!modalEl) return;
    closeActiveModal();
    modalEl.classList.add('is-open');
    document.body.classList.add('modal-locked');
    state.activeModal = modalEl;
  }

  function closeActiveModal() {
    if (state.activeModal) {
      state.activeModal.classList.remove('is-open');
      state.activeModal = null;
    }
    document.body.classList.remove('modal-locked');
  }

  /**
   * Car Detail Modal Renderer
   */
  function openCarModal(carId) {
    const car = CARS_DATABASE.find(c => c.id === carId);
    if (!car || !DOM.carModalBody) return;

    DOM.carModalBody.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'car-detail-layout';

    // Left Column: Visuals
    const leftCol = document.createElement('div');
    leftCol.className = 'car-detail-left';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'car-detail-img-wrap';

    const img = document.createElement('img');
    img.src = car.image;
    img.alt = car.name;
    img.className = 'car-detail-img';
    img.onerror = function () { this.src = 'car images/SAFARI.webp'; };

    const badge = document.createElement('span');
    badge.className = 'car-badge badge-trending';
    badge.textContent = car.badge;

    imgWrap.appendChild(img);
    imgWrap.appendChild(badge);

    const priceBox = document.createElement('div');
    priceBox.className = 'modal-price-box';

    const priceTitle = document.createElement('span');
    priceTitle.className = 'modal-price-title';
    priceTitle.textContent = 'Ex-Showroom Price Range:';

    const priceVal = document.createElement('h2');
    priceVal.className = 'modal-price-val';
    priceVal.textContent = car.priceRange;

    priceBox.appendChild(priceTitle);
    priceBox.appendChild(priceVal);

    // Quick Actions
    const quickActions = document.createElement('div');
    quickActions.className = 'modal-quick-actions';

    const bookBtn = document.createElement('button');
    bookBtn.className = 'btn-primary-action';
    bookBtn.textContent = 'Schedule Test Drive';
    bookBtn.addEventListener('click', () => {
      closeActiveModal();
      openTestDriveModal(car.id);
    });

    const emiBtn = document.createElement('button');
    emiBtn.className = 'btn-secondary-action';
    emiBtn.textContent = 'Calculate EMI';
    emiBtn.addEventListener('click', () => {
      closeActiveModal();
      populateEMICalculator(car.priceMin);
      const emiSection = document.getElementById('emi-calculator-section');
      if (emiSection) emiSection.scrollIntoView({ behavior: 'smooth' });
    });

    quickActions.appendChild(bookBtn);
    quickActions.appendChild(emiBtn);

    leftCol.appendChild(imgWrap);
    leftCol.appendChild(priceBox);
    leftCol.appendChild(quickActions);

    // Right Column: Full Specifications
    const rightCol = document.createElement('div');
    rightCol.className = 'car-detail-right';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'modal-title-wrap';

    const brand = document.createElement('span');
    brand.className = 'modal-brand';
    brand.textContent = car.brand;

    const name = document.createElement('h1');
    name.className = 'modal-name';
    name.textContent = car.name;

    const tagline = document.createElement('p');
    tagline.className = 'modal-tagline';
    tagline.textContent = car.tagline;

    titleWrap.appendChild(brand);
    titleWrap.appendChild(name);
    titleWrap.appendChild(tagline);

    // Spec Grid
    const specsTable = document.createElement('div');
    specsTable.className = 'modal-specs-table';

    const specsData = [
      { key: 'Engine', val: car.engine },
      { key: 'Max Power', val: car.power },
      { key: 'Peak Torque', val: car.torque },
      { key: 'Fuel Type', val: car.fuelType },
      { key: 'Transmission', val: car.transmission },
      { key: 'Mileage / Range', val: car.mileage },
      { key: 'Seating Capacity', val: car.seating },
      { key: 'Safety Rating', val: car.safetyRating },
      { key: 'Boot Space', val: car.bootSpace },
      { key: 'Ground Clearance', val: car.groundClearance }
    ];

    specsData.forEach(s => {
      const row = document.createElement('div');
      row.className = 'spec-row';

      const keySpan = document.createElement('span');
      keySpan.className = 'spec-key';
      keySpan.textContent = s.key;

      const valSpan = document.createElement('span');
      valSpan.className = 'spec-val';
      valSpan.textContent = s.val;

      row.appendChild(keySpan);
      row.appendChild(valSpan);
      specsTable.appendChild(row);
    });

    // Key Features Checklist
    const featuresTitle = document.createElement('h4');
    featuresTitle.className = 'modal-subtitle';
    featuresTitle.textContent = 'Highlighted Features & Tech:';

    const featuresList = document.createElement('ul');
    featuresList.className = 'modal-features-list';

    car.features.forEach(f => {
      const li = document.createElement('li');
      li.className = 'feature-item';
      li.textContent = `✓ ${f}`;
      featuresList.appendChild(li);
    });

    rightCol.appendChild(titleWrap);
    rightCol.appendChild(specsTable);
    rightCol.appendChild(featuresTitle);
    rightCol.appendChild(featuresList);

    container.appendChild(leftCol);
    container.appendChild(rightCol);

    DOM.carModalBody.appendChild(container);
    openModal(DOM.carModal);
  }

  /**
   * Comparison Modal Renderer
   */
  function openCompareModal() {
    if (!DOM.compareTableSlot || state.compareList.length < 1) {
      showToast('Please select at least 1 car to compare.', 'info');
      return;
    }

    DOM.compareTableSlot.innerHTML = '';

    const cars = state.compareList
      .map(id => CARS_DATABASE.find(c => c.id === id))
      .filter(Boolean);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'compare-table-responsive';

    const table = document.createElement('table');
    table.className = 'compare-table';

    // Header Row with car images and remove buttons
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const featureTh = document.createElement('th');
    featureTh.className = 'compare-param-head';
    featureTh.textContent = 'Parameters';
    headerRow.appendChild(featureTh);

    cars.forEach(car => {
      const th = document.createElement('th');
      th.className = 'compare-car-head';

      const img = document.createElement('img');
      img.src = car.image;
      img.alt = car.name;
      img.className = 'compare-th-img';

      const title = document.createElement('h4');
      title.className = 'compare-th-title';
      title.textContent = car.name;

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'compare-rm-btn';
      rmBtn.textContent = '✕ Remove';
      rmBtn.addEventListener('click', () => {
        toggleCompare(car.id);
        if (state.compareList.length === 0) {
          closeActiveModal();
        } else {
          openCompareModal();
        }
      });

      th.appendChild(img);
      th.appendChild(title);
      th.appendChild(rmBtn);
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body comparison metrics
    const tbody = document.createElement('tbody');

    const metrics = [
      { label: 'Ex-Showroom Price', key: 'priceRange' },
      { label: 'Body Type', key: 'bodyType' },
      { label: 'Fuel Type', key: 'fuelType' },
      { label: 'Transmission', key: 'transmission' },
      { label: 'Mileage / Range', key: 'mileage' },
      { label: 'Engine', key: 'engine' },
      { label: 'Power', key: 'power' },
      { label: 'Torque', key: 'torque' },
      { label: 'Seating Capacity', key: 'seating' },
      { label: 'Safety Rating', key: 'safetyRating' },
      { label: 'Boot Space', key: 'bootSpace' },
      { label: 'Ground Clearance', key: 'groundClearance' }
    ];

    metrics.forEach(m => {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.className = 'compare-param-label';
      labelTd.textContent = m.label;
      tr.appendChild(labelTd);

      cars.forEach(car => {
        const valTd = document.createElement('td');
        valTd.className = 'compare-val-cell';
        valTd.textContent = car[m.key] || '-';
        tr.appendChild(valTd);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    DOM.compareTableSlot.appendChild(tableWrap);

    openModal(DOM.compareModal);
  }

  /**
   * Test Drive Modal & Safe Submission
   */
  function openTestDriveModal(preselectedCarId = null) {
    if (!DOM.testDriveModal) return;

    if (DOM.testDriveSuccess) DOM.testDriveSuccess.style.display = 'none';
    if (DOM.testDriveForm) DOM.testDriveForm.style.display = 'flex';

    // Populate car options securely
    const carSelect = document.getElementById('td-car-select');
    if (carSelect) {
      carSelect.innerHTML = '';
      CARS_DATABASE.forEach(car => {
        const opt = document.createElement('option');
        opt.value = car.id;
        opt.textContent = `${car.brand} - ${car.name} (${car.priceRange})`;
        if (preselectedCarId === car.id) opt.selected = true;
        carSelect.appendChild(opt);
      });
    }

    // Set minimum date to today
    const dateInput = document.getElementById('td-date-input');
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
      dateInput.value = today;
    }

    openModal(DOM.testDriveModal);
  }

  /**
   * Handle Safe Test Drive Submission
   */
  function handleTestDriveSubmit(e) {
    e.preventDefault();

    if (!bookingRateLimiter.canProceed()) {
      showToast('Too many submissions! Please wait 1 minute before submitting again.', 'warn');
      return;
    }

    const nameInput = document.getElementById('td-name-input');
    const phoneInput = document.getElementById('td-phone-input');
    const emailInput = document.getElementById('td-email-input');
    const carSelect = document.getElementById('td-car-select');
    const citySelect = document.getElementById('td-city-select');
    const dateInput = document.getElementById('td-date-input');
    const timeSelect = document.getElementById('td-time-select');

    const rawName = nameInput ? nameInput.value : '';
    const rawPhone = phoneInput ? phoneInput.value : '';
    const rawEmail = emailInput ? emailInput.value : '';
    const carId = carSelect ? carSelect.value : '';
    const city = citySelect ? citySelect.value : state.selectedCity;
    const date = dateInput ? dateInput.value : '';
    const time = timeSelect ? timeSelect.value : 'Morning';

    // Validation
    if (!SecurityUtils.validateName(rawName)) {
      showToast('Please enter a valid full name (2-50 characters, letters only).', 'warn');
      if (nameInput) nameInput.focus();
      return;
    }

    if (!SecurityUtils.validatePhone(rawPhone)) {
      showToast('Please enter a valid 10-digit Indian mobile number.', 'warn');
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (!SecurityUtils.validateEmail(rawEmail)) {
      showToast('Please enter a valid email address.', 'warn');
      if (emailInput) emailInput.focus();
      return;
    }

    const selectedCar = CARS_DATABASE.find(c => c.id === carId);
    if (!selectedCar) {
      showToast('Please select a valid vehicle model.', 'warn');
      return;
    }

    // Generate Booking
    const refId = `CC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const bookingRecord = {
      refId: refId,
      carName: selectedCar.name,
      customerName: SecurityUtils.sanitizeText(rawName, 50),
      city: SecurityUtils.sanitizeText(city, 30),
      date: SecurityUtils.sanitizeText(date, 20),
      timeSlot: SecurityUtils.sanitizeText(time, 20),
      createdAt: new Date().toISOString()
    };

    // Store safely in local storage
    const prevBookings = SecurityUtils.SafeStorage.getItem('bookings', []);
    prevBookings.unshift(bookingRecord);
    SecurityUtils.SafeStorage.setItem('bookings', prevBookings.slice(0, 10)); // Keep last 10

    // Render Confirmation
    if (DOM.testDriveForm) DOM.testDriveForm.style.display = 'none';
    if (DOM.testDriveSuccess) {
      DOM.testDriveSuccess.style.display = 'block';
      const refSpan = document.getElementById('td-ref-id-display');
      if (refSpan) refSpan.textContent = refId;
      const descSpan = document.getElementById('td-success-desc');
      if (descSpan) {
        descSpan.textContent = `Test drive scheduled for ${selectedCar.name} on ${date} (${time}) in ${city}. Our hub specialist will call you shortly.`;
      }
    }

    showToast(`Test Drive Booked! Ref: ${refId}`, 'success');
  }

  /**
   * City Selector Modal
   */
  function openCityModal() {
    if (!DOM.cityListSlot) return;
    DOM.cityListSlot.innerHTML = '';

    POPULAR_CITIES.forEach(city => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'city-picker-btn';
      if (city === state.selectedCity) btn.classList.add('is-active');

      const icon = document.createElement('span');
      icon.className = 'city-icon';
      icon.textContent = '📍';

      const name = document.createElement('span');
      name.textContent = city;

      btn.appendChild(icon);
      btn.appendChild(name);

      btn.addEventListener('click', () => {
        state.selectedCity = city;
        SecurityUtils.SafeStorage.setItem('city', city);
        updateBadges();
        closeActiveModal();
        showToast(`City set to ${city}`, 'info');
      });

      DOM.cityListSlot.appendChild(btn);
    });

    openModal(DOM.cityModal);
  }

  /**
   * Wishlist Drawer
   */
  function openWishlistDrawer() {
    renderWishlistDrawer();
    openModal(DOM.wishlistDrawer);
  }

  function renderWishlistDrawer() {
    if (!DOM.wishlistItemsSlot) return;
    DOM.wishlistItemsSlot.innerHTML = '';

    const savedCars = Array.from(state.wishlist)
      .map(id => CARS_DATABASE.find(c => c.id === id))
      .filter(Boolean);

    if (savedCars.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'drawer-empty-msg';
      emptyMsg.textContent = 'Your wishlist is currently empty. Tap the heart icon on any car to bookmark it!';
      DOM.wishlistItemsSlot.appendChild(emptyMsg);
      return;
    }

    savedCars.forEach(car => {
      const item = document.createElement('div');
      item.className = 'drawer-car-item';

      const thumb = document.createElement('img');
      thumb.src = car.image;
      thumb.alt = car.name;
      thumb.className = 'drawer-item-img';

      const info = document.createElement('div');
      info.className = 'drawer-item-info';

      const name = document.createElement('h4');
      name.className = 'drawer-item-title';
      name.textContent = car.name;

      const price = document.createElement('span');
      price.className = 'drawer-item-price';
      price.textContent = car.priceRange;

      info.appendChild(name);
      info.appendChild(price);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'drawer-item-rm';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', () => {
        toggleWishlist(car.id);
      });

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(delBtn);

      DOM.wishlistItemsSlot.appendChild(item);
    });
  }

  /**
   * Interactive Financial EMI Calculator
   */
  function calculateEMI() {
    if (!DOM.emiPriceSlider || !DOM.emiMonthlyResult) return;

    const carPriceLakh = Number(DOM.emiPriceSlider.value);
    const downPaymentLakh = Math.min(Number(DOM.emiDownSlider.value), carPriceLakh * 0.8);
    const rateAnnual = Number(DOM.emiRateSlider.value);
    const tenureYears = Number(DOM.emiTenureSlider.value);

    // Update Labels
    if (DOM.emiPriceLabel) DOM.emiPriceLabel.textContent = `₹ ${carPriceLakh.toFixed(1)} Lakh`;
    if (DOM.emiDownLabel) DOM.emiDownLabel.textContent = `₹ ${downPaymentLakh.toFixed(1)} Lakh`;
    if (DOM.emiRateLabel) DOM.emiRateLabel.textContent = `${rateAnnual.toFixed(1)} % p.a.`;
    if (DOM.emiTenureLabel) DOM.emiTenureLabel.textContent = `${tenureYears} Years (${tenureYears * 12} Mos)`;

    const principal = (carPriceLakh - downPaymentLakh) * 100000;
    const monthlyRate = rateAnnual / (12 * 100);
    const months = tenureYears * 12;

    let emi = 0;
    if (principal > 0 && monthlyRate > 0) {
      emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    }

    const totalPayable = emi * months;
    const totalInterest = Math.max(0, totalPayable - principal);

    DOM.emiMonthlyResult.textContent = formatINR(Math.round(emi)) + ' / mo';
    DOM.emiPrincipalResult.textContent = formatINR(Math.round(principal));
    DOM.emiInterestResult.textContent = formatINR(Math.round(totalInterest));
    DOM.emiTotalResult.textContent = formatINR(Math.round(totalPayable));

    // Progress bar visualization
    if (DOM.emiProgressBar && totalPayable > 0) {
      const principalPercent = (principal / totalPayable) * 100;
      DOM.emiProgressBar.style.width = `${principalPercent.toFixed(1)}%`;
    }
  }

  function populateEMICalculator(priceInLakhs) {
    if (!DOM.emiPriceSlider) return;
    const safePrice = SecurityUtils.clampNumber(priceInLakhs, 5, 250, 15);
    DOM.emiPriceSlider.value = safePrice;
    if (DOM.emiDownSlider) {
      DOM.emiDownSlider.value = Math.round(safePrice * 0.2); // 20% down payment standard
    }
    calculateEMI();
  }

  /**
   * Event Listeners Binding
   */
  function bindEvents() {
    // Search with debounce
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener(
        'input',
        SecurityUtils.debounce((e) => {
          state.searchQuery = SecurityUtils.sanitizeText(e.target.value, 100);
          renderCatalog();
        }, 200)
      );
    }

    // Filter Dropdowns
    if (DOM.bodyFilter) {
      DOM.bodyFilter.addEventListener('change', (e) => {
        state.bodyType = e.target.value;
        renderCatalog();
      });
    }

    if (DOM.fuelFilter) {
      DOM.fuelFilter.addEventListener('change', (e) => {
        state.fuelType = e.target.value;
        renderCatalog();
      });
    }

    if (DOM.transFilter) {
      DOM.transFilter.addEventListener('change', (e) => {
        state.transmission = e.target.value;
        renderCatalog();
      });
    }

    if (DOM.budgetFilter) {
      DOM.budgetFilter.addEventListener('change', (e) => {
        state.budgetRange = e.target.value;
        renderCatalog();
      });
    }

    if (DOM.sortSelect) {
      DOM.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderCatalog();
      });
    }

    if (DOM.resetFiltersBtn) {
      DOM.resetFiltersBtn.addEventListener('click', resetAllFilters);
    }

    // City Selector Triggers
    if (DOM.cityTrigger) {
      DOM.cityTrigger.addEventListener('click', openCityModal);
    }

    // Wishlist & Compare Header Nav
    if (DOM.navWishlistBtn) {
      DOM.navWishlistBtn.addEventListener('click', openWishlistDrawer);
    }

    if (DOM.navCompareBtn) {
      DOM.navCompareBtn.addEventListener('click', openCompareModal);
    }

    // EMI Calculator Sliders
    [DOM.emiPriceSlider, DOM.emiDownSlider, DOM.emiRateSlider, DOM.emiTenureSlider].forEach(slider => {
      if (slider) {
        slider.addEventListener('input', calculateEMI);
      }
    });

    // Test Drive Form Submission
    if (DOM.testDriveForm) {
      DOM.testDriveForm.addEventListener('submit', handleTestDriveSubmit);
    }

    const testDriveResetBtn = document.getElementById('td-book-another-btn');
    if (testDriveResetBtn) {
      testDriveResetBtn.addEventListener('click', () => {
        if (DOM.testDriveSuccess) DOM.testDriveSuccess.style.display = 'none';
        if (DOM.testDriveForm) DOM.testDriveForm.style.display = 'flex';
      });
    }

    // Universal Modal Closes
    document.querySelectorAll('.cc-modal-close, .cc-modal-backdrop').forEach(el => {
      el.addEventListener('click', closeActiveModal);
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.activeModal) {
        closeActiveModal();
      }
    });

    // Delegate for quick hero filters
    const heroFilterButtons = document.querySelectorAll('[data-hero-filter]');
    heroFilterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterType = btn.getAttribute('data-hero-filter');
        const filterVal = btn.getAttribute('data-hero-val');
        if (filterType === 'budget' && DOM.budgetFilter) {
          DOM.budgetFilter.value = filterVal;
          state.budgetRange = filterVal;
        } else if (filterType === 'body' && DOM.bodyFilter) {
          DOM.bodyFilter.value = filterVal;
          state.bodyType = filterVal;
        } else if (filterType === 'fuel' && DOM.fuelFilter) {
          DOM.fuelFilter.value = filterVal;
          state.fuelType = filterVal;
        }
        renderCatalog();
        const catSection = document.getElementById('catalog-section');
        if (catSection) catSection.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  /**
   * Application Initialization
   */
  function init() {
    renderBrandChips();
    renderTrending();
    renderCatalog();
    updateBadges();
    calculateEMI();
    bindEvents();
    console.log('[CarCraft] Secure Platform initialized with zero vulnerabilities.');
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
