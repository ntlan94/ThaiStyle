/**
 * ============================================================================
 * FILE: script.js
 * PURPOSE: Object-Oriented Application Architecture for Thai Style Irymple.
 * ARCHITECTURE:
 *   1. MenuItem          - Data model representing a dish on the menu.
 *   2. CartItem          - Data model representing a customized line item.
 *   3. StorageService    - Encapsulates LocalStorage for cart, customer info,
 *                          and device-based order history (Kaffenio pattern).
 *   4. MenuRepository    - Central catalog manager with category, search,
 *                          and dietary tag filtering.
 *   5. CartManager       - Reactive state engine managing quantities,
 *                          modifiers, totals, and kitchen docket formatting.
 *   6. NavigationUI      - Handles sticky scroll header, mobile menu, and
 *                          highlighting today's opening hours.
 *   7. ThaiStyleApp      - Main controller wiring DOM events, modals, and UI.
 * ============================================================================
 */

'use strict';

/* ==========================================================================
   1. DOMAIN MODELS (MenuItem & CartItem)
   ========================================================================== */

class MenuItem {
  /**
   * @param {Object} data - Raw dish properties
   */
  constructor({ id, name, category, basePrice, description, image, badges = [], customizable = true }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.basePrice = Number(basePrice);
    this.description = description;
    this.image = image;
    this.badges = badges;
    this.customizable = customizable;
  }

  /**
   * Formats the base price in AUD.
   * @returns {string}
   */
  getFormattedPrice() {
    return `$${this.basePrice.toFixed(2)}`;
  }
}

class CartItem {
  /**
   * @param {MenuItem} menuItem
   * @param {Object} modifiers
   * @param {number} quantity
   */
  constructor(menuItem, modifiers = {}, quantity = 1) {
    this.menuItem = menuItem;
    this.protein = modifiers.protein || 'Standard';
    this.proteinExtra = Number(modifiers.proteinExtra || 0);
    this.spice = modifiers.spice || 'Medium';
    this.notes = (modifiers.notes || '').trim();
    this.quantity = quantity;

    // Composite key ensures identical items with different spice/protein stay separate
    this.signatureKey = `${menuItem.id}__${this.protein}__${this.spice}__${this.notes.toLowerCase()}`;
  }

  /**
   * Calculates the single unit price including protein add-ons.
   * @returns {number}
   */
  getUnitPrice() {
    return this.menuItem.basePrice + this.proteinExtra;
  }

  /**
   * Calculates total line price (unit price * quantity).
   * @returns {number}
   */
  getLineTotal() {
    return this.getUnitPrice() * this.quantity;
  }
}

/* ==========================================================================
   2. LOCAL STORAGE SERVICE (Kaffenio Device-History Pattern)
   ========================================================================== */

class StorageService {
  constructor() {
    this.KEYS = {
      CART: 'thaistyle_active_cart_v1',
      LAST_ORDER: 'thaistyle_last_order_v1',
      CUSTOMER: 'thaistyle_customer_prefs_v1',
      CONSENT: 'thaistyle_storage_consent_v1'
    };
  }

  save(key, payload) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      console.warn('LocalStorage write skipped:', err);
    }
  }

  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }
}

/* ==========================================================================
   3. MENU REPOSITORY (Catalog & Filtering Engine)
   ========================================================================== */

class MenuRepository {
  constructor(rawDishes) {
    this.dishes = rawDishes.map(item => new MenuItem(item));
  }

  /**
   * Returns an array of categories with their exact item counts (Kaffenio style).
   * @returns {Array<{name: string, count: number}>}
   */
  getCategoriesWithCounts() {
    const counts = new Map();
    counts.set('Featured', this.dishes.filter(d => d.badges.includes('Popular')).length);

    this.dishes.forEach(dish => {
      counts.set(dish.category, (counts.get(dish.category) || 0) + 1);
    });

    const result = [];
    counts.forEach((count, name) => result.push({ name, count }));
    return result;
  }

  /**
   * Filters dishes by category, search query, and dietary badge.
   */
  query({ category = 'Featured', search = '', dietary = 'all' }) {
    const cleanSearch = search.trim().toLowerCase();

    return this.dishes.filter(dish => {
      const matchesCategory =
        cleanSearch.length > 0 // Search across all categories when typing
          ? true
          : category === 'Featured'
          ? dish.badges.includes('Popular')
          : dish.category === category;

      const matchesSearch =
        !cleanSearch ||
        dish.name.toLowerCase().includes(cleanSearch) ||
        dish.description.toLowerCase().includes(cleanSearch) ||
        dish.category.toLowerCase().includes(cleanSearch);

      const matchesDietary =
        dietary === 'all' || dish.badges.includes(dietary);

      return matchesCategory && matchesSearch && matchesDietary;
    });
  }

  findById(id) {
    return this.dishes.find(dish => dish.id === id) || null;
  }
}

/* ==========================================================================
   4. SHOPPING CART MANAGER (State & Docket Builder)
   ========================================================================== */

class CartManager {
  /**
   * @param {StorageService} storage
   * @param {MenuRepository} repo
   */
  constructor(storage, repo) {
    this.storage = storage;
    this.repo = repo;
    this.items = [];
    this.fulfillmentMode = 'Pickup';
    this.listeners = [];
    this.restoreFromStorage();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.persistToStorage();
    this.listeners.forEach(fn => fn(this));
  }

  addItem(menuItem, modifiers = {}, quantity = 1) {
    const incoming = new CartItem(menuItem, modifiers, quantity);
    const existing = this.items.find(i => i.signatureKey === incoming.signatureKey);

    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push(incoming);
    }
    this.notify();
  }

  updateQuantity(signatureKey, delta) {
    const index = this.items.findIndex(i => i.signatureKey === signatureKey);
    if (index === -1) return;

    this.items[index].quantity += delta;
    if (this.items[index].quantity <= 0) {
      this.items.splice(index, 1);
    }
    this.notify();
  }

  setFulfillmentMode(mode) {
    this.fulfillmentMode = mode;
    this.notify();
  }

  clear() {
    this.items = [];
    this.notify();
  }

  getTotalCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getTotalAmount() {
    return this.items.reduce((sum, item) => sum + item.getLineTotal(), 0);
  }

  persistToStorage() {
    const serialized = this.items.map(item => ({
      dishId: item.menuItem.id,
      protein: item.protein,
      proteinExtra: item.proteinExtra,
      spice: item.spice,
      notes: item.notes,
      quantity: item.quantity
    }));
    this.storage.save(this.storage.KEYS.CART, {
      fulfillmentMode: this.fulfillmentMode,
      items: serialized
    });
  }

  restoreFromStorage() {
    const saved = this.storage.load(this.storage.KEYS.CART);
    if (!saved || !Array.isArray(saved.items)) return;

    this.fulfillmentMode = saved.fulfillmentMode || 'Pickup';
    this.items = saved.items
      .map(entry => {
        const dish = this.repo.findById(entry.dishId);
        if (!dish) return null;
        return new CartItem(
          dish,
          {
            protein: entry.protein,
            proteinExtra: entry.proteinExtra,
            spice: entry.spice,
            notes: entry.notes
          },
          entry.quantity
        );
      })
      .filter(Boolean);
  }

  /**
   * Saves the completed order so the customer can one-click reorder next time.
   */
  archiveCurrentOrder() {
    const snapshot = this.storage.load(this.storage.KEYS.CART);
    if (snapshot && snapshot.items && snapshot.items.length > 0) {
      this.storage.save(this.storage.KEYS.LAST_ORDER, snapshot);
    }
  }

  restoreLastArchivedOrder() {
    const lastOrder = this.storage.load(this.storage.KEYS.LAST_ORDER);
    if (!lastOrder) return false;
    this.storage.save(this.storage.KEYS.CART, lastOrder);
    this.restoreFromStorage();
    this.notify();
    return true;
  }

  /**
   * Builds a clean text docket for the kitchen / SMS / POS webhook.
   */
  buildKitchenDocket({ customerName, customerPhone, pickupTime }) {
    const orderNumber = `TS-${Date.now().toString().slice(-4)}`;
    const lines = [
      `=== THAI STYLE IRYMPLE ORDER (${orderNumber}) ===`,
      `Type: ${this.fulfillmentMode} | Time: ${pickupTime}`,
      `Customer: ${customerName || 'Guest'} (${customerPhone || 'N/A'})`,
      `----------------------------------------`
    ];

    this.items.forEach(item => {
      lines.push(`${item.quantity}x ${item.menuItem.name} ($${item.getLineTotal().toFixed(2)})`);
      if (item.menuItem.customizable) {
        lines.push(`   • ${item.protein} | Spice: ${item.spice}`);
      }
      if (item.notes) {
        lines.push(`   • Note: "${item.notes}"`);
      }
    });

    lines.push(`----------------------------------------`);
    lines.push(`TOTAL AUD: $${this.getTotalAmount().toFixed(2)}`);
    return { orderNumber, docketText: lines.join('\n') };
  }
}

/* ==========================================================================
   5. NAVIGATION & STORE HOURS CONTROLLER
   ========================================================================== */

class NavigationUI {
  constructor() {
    this.body = document.body;
    this.mobileToggle = document.getElementById('mobile-toggle');
    this.navWrapper = document.getElementById('nav-wrapper');
    this.hoursList = document.getElementById('hours-list');
    this.init();
  }

  init() {
    // 1. Scroll header state
    const onScroll = () => {
      this.body.classList.toggle('scroll', window.scrollY >= 60);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // 2. Mobile drawer toggle
    if (this.mobileToggle && this.navWrapper) {
      this.mobileToggle.addEventListener('click', () => {
        const isOpen = this.navWrapper.classList.toggle('open');
        this.mobileToggle.classList.toggle('cs-active', isOpen);
        this.mobileToggle.setAttribute('aria-expanded', String(isOpen));
      });

      // Close mobile nav when clicking a link
      this.navWrapper.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          this.navWrapper.classList.remove('open');
          this.mobileToggle.classList.remove('cs-active');
        });
      });
    }

    // 3. Highlight current day in Location & Hours list
    if (this.hoursList) {
      const todayIndex = new Date().getDay();
      const row = this.hoursList.querySelector(`li[data-day="${todayIndex}"]`);
      if (row) row.classList.add('today');
    }
  }
}

/* ==========================================================================
   6. MAIN APPLICATION CONTROLLER (ThaiStyleApp)
   ========================================================================== */

class ThaiStyleApp {
  constructor(menuData) {
    this.storage = new StorageService();
    this.repo = new MenuRepository(menuData);
    this.cart = new CartManager(this.storage, this.repo);
    this.navUI = new NavigationUI();

    // Filter state
    this.state = {
      activeCategory: 'Featured',
      searchQuery: '',
      dietaryFilter: 'all',
      activeModalDish: null
    };

    this.cacheDOM();
    this.bindEvents();
    this.renderCategories();
    this.renderCatalog();
    this.renderCart();
    this.checkStorageBanner();
  }

  cacheDOM() {
    this.pillStrip = document.getElementById('category-pill-strip');
    this.sidebarList = document.getElementById('sidebar-category-list');
    this.catalogTitle = document.getElementById('active-category-title');
    this.catalogCount = document.getElementById('active-category-count');
    this.cardsContainer = document.getElementById('menu-cards-container');
    this.searchInput = document.getElementById('menu-search-input');
    this.dietaryGroup = document.getElementById('dietary-filter-group');

    // Cart elements
    this.cartCountBadge = document.getElementById('cart-badge-count');
    this.cartItemsContainer = document.getElementById('cart-items-container');
    this.cartTotalAmount = document.getElementById('cart-total-amount');
    this.clearCartBtn = document.getElementById('clear-cart-btn');
    this.fulfillmentBtns = document.querySelectorAll('.fulfillment-btn');
    this.fulfillmentLabel = document.getElementById('summary-fulfillment-label');
    this.openCheckoutBtn = document.getElementById('open-checkout-btn');
    this.recentOrderBox = document.getElementById('recent-order-container');
    this.restoreOrderBtn = document.getElementById('restore-last-order-btn');

    // Mobile sticky bar
    this.mobileBar = document.getElementById('mobile-checkout-bar');
    this.mobileBarCount = document.getElementById('mobile-bar-count');
    this.mobileBarTotal = document.getElementById('mobile-bar-total');

    // Modals
    this.itemModal = document.getElementById('item-modal');
    this.closeItemModalBtn = document.getElementById('close-item-modal');
    this.customizeForm = document.getElementById('item-customize-form');
    this.modalCat = document.getElementById('modal-item-category');
    this.modalTitle = document.getElementById('modal-item-title');
    this.modalDesc = document.getElementById('modal-item-desc');
    this.modProtein = document.getElementById('mod-protein');
    this.modSpice = document.getElementById('mod-spice');
    this.modNotes = document.getElementById('mod-notes');

    this.checkoutModal = document.getElementById('checkout-modal');
    this.closeCheckoutModalBtn = document.getElementById('close-checkout-modal');
    this.checkoutForm = document.getElementById('checkout-form');
    this.docketPreview = document.getElementById('checkout-docket-preview');
    this.custName = document.getElementById('cust-name');
    this.custPhone = document.getElementById('cust-phone');
    this.custTime = document.getElementById('cust-time');

    // Storage banner
    this.storageBanner = document.getElementById('storage-banner');
    this.acceptStorageBtn = document.getElementById('accept-storage-btn');
  }

  bindEvents() {
    // Subscribe UI to cart changes
    this.cart.subscribe(() => this.renderCart());

    // Live Search
    this.searchInput.addEventListener('input', e => {
      this.state.searchQuery = e.target.value;
      this.renderCatalog();
    });

    // Dietary Filter Chips
    this.dietaryGroup.addEventListener('click', e => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      this.dietaryGroup.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.state.dietaryFilter = chip.dataset.filter;
      this.renderCatalog();
    });

    // Fulfillment Toggle (Pickup vs Dine-In)
    this.fulfillmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.fulfillmentBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.cart.setFulfillmentMode(btn.dataset.mode);
      });
    });

    // Clear Cart
    this.clearCartBtn.addEventListener('click', () => this.cart.clear());

    // Restore Last Order
    this.restoreOrderBtn.addEventListener('click', () => {
      this.cart.restoreLastArchivedOrder();
    });

    // Item Modal Submission
    this.customizeForm.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.state.activeModalDish) return;

      const [proteinName, extraPrice] = this.modProtein.value.split('|');
      this.cart.addItem(this.state.activeModalDish, {
        protein: proteinName,
        proteinExtra: parseFloat(extraPrice || '0'),
        spice: this.modSpice.value,
        notes: this.modNotes.value
      });
      this.closeModals();
    });

    this.closeItemModalBtn.addEventListener('click', () => this.closeModals());
    this.closeCheckoutModalBtn.addEventListener('click', () => this.closeModals());

    // Open Checkout Modal
    const handleOpenCheckout = () => {
      if (this.cart.getTotalCount() === 0) {
        document.getElementById('menu-section').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      this.openCheckoutModal();
    };

    this.openCheckoutBtn.addEventListener('click', handleOpenCheckout);
    this.mobileBar.addEventListener('click', handleOpenCheckout);

    // Update docket preview dynamically when customer types
    [this.custName, this.custPhone, this.custTime].forEach(input => {
      input.addEventListener('input', () => this.updateDocketPreview());
    });

    // Submit Checkout Order
    this.checkoutForm.addEventListener('submit', e => {
      e.preventDefault();
      this.handleOrderSubmission();
    });

    // Close modals when clicking backdrop
    [this.itemModal, this.checkoutModal].forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) this.closeModals();
      });
    });
  }

  setCategory(categoryName) {
    this.state.activeCategory = categoryName;
    this.state.searchQuery = '';
    this.searchInput.value = '';
    this.renderCategories();
    this.renderCatalog();
  }

  renderCategories() {
    const categories = this.repo.getCategoriesWithCounts();

    // 1. Horizontal Pill Strip
    this.pillStrip.innerHTML = categories
      .map(
        cat => `
        <button type="button" 
                class="category-pill ${cat.name === this.state.activeCategory ? 'active' : ''}"
                data-cat="${cat.name}">
          <span>${cat.name}</span>
          <span class="count">${cat.count}</span>
        </button>
      `
      )
      .join('');

    // 2. Left-hand Kaffenio Sidebar List
    this.sidebarList.innerHTML = categories
      .map(
        cat => `
        <li>
          <button type="button"
                  class="sidebar-cat-btn ${cat.name === this.state.activeCategory ? 'active' : ''}"
                  data-cat="${cat.name}">
            <span>${cat.name}</span>
            <span class="cat-count">${cat.count} items</span>
          </button>
        </li>
      `
      )
      .join('');

    // Bind category clicks
    const bindCatClick = container => {
      container.querySelectorAll('[data-cat]').forEach(btn => {
        btn.addEventListener('click', () => this.setCategory(btn.dataset.cat));
      });
    };
    bindCatClick(this.pillStrip);
    bindCatClick(this.sidebarList);
  }

  renderCatalog() {
    const matchingDishes = this.repo.query({
      category: this.state.activeCategory,
      search: this.state.searchQuery,
      dietary: this.state.dietaryFilter
    });

    this.catalogTitle.textContent = this.state.searchQuery
      ? `Search Results for "${this.state.searchQuery}"`
      : this.state.activeCategory;
    this.catalogCount.textContent = `${matchingDishes.length} ${
      matchingDishes.length === 1 ? 'item' : 'items'
    }`;

    if (matchingDishes.length === 0) {
      this.cardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 2.5rem; text-align: center; background: var(--bgSurface); border-radius: var(--radiusMd);">
          <p class="cs-text" style="margin-inline:auto;">No dishes matched your filter. Try clearing your search or switching categories.</p>
        </div>
      `;
      return;
    }

    this.cardsContainer.innerHTML = matchingDishes
      .map(dish => {
        const badgeHTML = dish.badges
          .map(b => {
            const cls =
              b === 'Popular'
                ? 'badge-popular'
                : b === 'Spicy'
                ? 'badge-spicy'
                : 'badge-dietary';
            return `<span class="badge ${cls}">${b}</span>`;
          })
          .join('');

        return `
        <article class="dish-card">
          <div class="dish-card-media">
            <img src="${dish.image}" alt="${dish.name}" loading="lazy" />
            <div class="dish-badges">${badgeHTML}</div>
          </div>
          <div class="dish-card-body">
            <div class="dish-card-top">
              <h4 class="dish-title">${dish.name}</h4>
              <span class="dish-price">${dish.getFormattedPrice()}</span>
            </div>
            <p class="dish-desc">${dish.description}</p>
            <div class="dish-actions">
              <button type="button" class="btn btn-outline btn-sm view-item-btn" data-id="${dish.id}">
                View item
              </button>
              <button type="button" class="btn btn-solid btn-sm quick-add-btn" data-id="${dish.id}">
                + Add
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    // Wire "View item" and "+ Add" buttons
    this.cardsContainer.querySelectorAll('.view-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dish = this.repo.findById(btn.dataset.id);
        if (dish) this.openItemModal(dish);
      });
    });

    this.cardsContainer.querySelectorAll('.quick-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dish = this.repo.findById(btn.dataset.id);
        if (!dish) return;
        this.cart.addItem(dish, {
          protein: dish.customizable ? 'Chicken' : 'Standard',
          proteinExtra: 0,
          spice: 'Medium'
        });
      });
    });
  }

  renderCart() {
    const totalCount = this.cart.getTotalCount();
    const totalPrice = `$${this.cart.getTotalAmount().toFixed(2)}`;

    this.cartCountBadge.textContent = `(${totalCount})`;
    this.cartTotalAmount.textContent = totalPrice;
    this.fulfillmentLabel.textContent =
      this.cart.fulfillmentMode === 'Pickup' ? 'Pickup (15–25 mins)' : 'Dine-In Table Service';

    // Mobile Floating Bar update
    this.mobileBarCount.textContent = `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`;
    this.mobileBarTotal.textContent = totalPrice;

    // Show "Reload Last Order" button if cart is empty and device has history
    const hasArchived = Boolean(this.storage.load(this.storage.KEYS.LAST_ORDER));
    this.recentOrderBox.style.display = totalCount === 0 && hasArchived ? 'flex' : 'none';

    if (this.cart.items.length === 0) {
      this.cartItemsContainer.innerHTML = `
        <div class="cart-empty-state">
          Start with your favorite curry, stir-fry, or entrée to build your pickup order.
        </div>
      `;
      return;
    }

    this.cartItemsContainer.innerHTML = this.cart.items
      .map(
        item => `
        <div class="cart-line-item">
          <div class="cart-line-info">
            <h4>${item.menuItem.name}</h4>
            ${
              item.menuItem.customizable
                ? `<p class="cart-line-mods">${item.protein} &bull; ${item.spice}</p>`
                : ''
            }
            ${item.notes ? `<p class="cart-line-mods">"${item.notes}"</p>` : ''}
            <span class="cart-line-price">$${item.getLineTotal().toFixed(2)}</span>
          </div>
          <div class="qty-controls">
            <button type="button" class="qty-btn" data-key="${item.signatureKey}" data-delta="-1" aria-label="Decrease quantity">&minus;</button>
            <span>${item.quantity}</span>
            <button type="button" class="qty-btn" data-key="${item.signatureKey}" data-delta="1" aria-label="Increase quantity">+</button>
          </div>
        </div>
      `
      )
      .join('');

    this.cartItemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.cart.updateQuantity(btn.dataset.key, Number(btn.dataset.delta));
      });
    });
  }

  openItemModal(dish) {
    this.state.activeModalDish = dish;
    this.modalCat.textContent = dish.category;
    this.modalTitle.textContent = `${dish.name} — ${dish.getFormattedPrice()}`;
    this.modalDesc.textContent = dish.description;
    this.modNotes.value = '';
    this.itemModal.classList.add('active');
    document.body.classList.add('modal-open');
  }

  openCheckoutModal() {
    const savedCust = this.storage.load(this.storage.KEYS.CUSTOMER, {});
    if (savedCust.name) this.custName.value = savedCust.name;
    if (savedCust.phone) this.custPhone.value = savedCust.phone;

    this.updateDocketPreview();
    this.checkoutModal.classList.add('active');
    document.body.classList.add('modal-open');
  }

  updateDocketPreview() {
    const { docketText } = this.cart.buildKitchenDocket({
      customerName: this.custName.value,
      customerPhone: this.custPhone.value,
      pickupTime: this.custTime.value
    });
    this.docketPreview.textContent = docketText;
  }

  handleOrderSubmission() {
    const customer = {
      name: this.custName.value.trim(),
      phone: this.custPhone.value.trim()
    };
    this.storage.save(this.storage.KEYS.CUSTOMER, customer);

    const { orderNumber, docketText } = this.cart.buildKitchenDocket({
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupTime: this.custTime.value
    });

    // Save to device history for Kaffenio-style one-click reorder
    this.cart.archiveCurrentOrder();
    this.cart.clear();

    // Replace form content with instant confirmation view
    this.docketPreview.textContent =
      `ORDER CONFIRMED (${orderNumber})!\n` +
      `Please call (03) 5024 5555 if you need any immediate changes.\n\n` +
      docketText;
  }

  closeModals() {
    this.itemModal.classList.remove('active');
    this.checkoutModal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }

  checkStorageBanner() {
    const accepted = this.storage.load(this.storage.KEYS.CONSENT, false);
    if (!accepted) {
      this.storageBanner.classList.add('visible');
    }
    this.acceptStorageBtn.addEventListener('click', () => {
      this.storage.save(this.storage.KEYS.CONSENT, true);
      this.storageBanner.classList.remove('visible');
    });
  }
}

/* ==========================================================================
   7. INITIALIZATION & MENU CATALOG DATA
   (Uses your local repository images: HoanhThanh.jpg, ThaiFood.jpg, ThaiStyle.jpg)
   ========================================================================== */

const THAISTYLE_MENU_DATA = [
  {
    id: 'ent-spring-rolls',
    name: 'Crispy Thai Spring Rolls (4 pcs)',
    category: 'Entrées & Starters',
    basePrice: 9.90,
    description: 'Golden pastry rolls filled with glass vermicelli, cabbage, carrot, and wood-ear mushrooms. Served with house sweet chili plum sauce.',
    image: 'image/HoanhThanh.jpg',
    badges: ['Popular', 'Vegetarian'],
    customizable: false
  },
  {
    id: 'ent-curry-puffs',
    name: 'Golden Curry Puffs (4 pcs)',
    category: 'Entrées & Starters',
    basePrice: 10.50,
    description: 'Flaky puff pastry parcels stuffed with aromatic yellow curry potato, sweet onion, and herbs.',
    image: 'image/ThaiStyle.jpg',
    badges: ['Vegetarian'],
    customizable: false
  },
  {
    id: 'ent-satay-skewers',
    name: 'Chargrilled Satay Chicken (4 skewers)',
    category: 'Entrées & Starters',
    basePrice: 12.90,
    description: 'Tender marinated chicken skewers topped with rich house-roasted peanut satay sauce.',
    image: 'image/ThaiFood.jpg',
    badges: ['Popular', 'GF'],
    customizable: false
  },
  {
    id: 'cur-green',
    name: 'Green Curry (Kaeng Khiao Wan)',
    category: 'Aromatic Curries',
    basePrice: 18.90,
    description: 'Traditional green chili paste simmered in creamy coconut milk with bamboo shoots, crisp seasonal greens, and sweet Thai basil.',
    image: 'image/ThaiFood.jpg',
    badges: ['Popular', 'Spicy', 'GF'],
    customizable: true
  },
  {
    id: 'cur-panang',
    name: 'Creamy Panang Curry',
    category: 'Aromatic Curries',
    basePrice: 18.90,
    description: 'Rich, nutty red curry infused with kaffir lime leaf, crushed peanuts, and coconut cream.',
    image: 'image/ThaiStyle.jpg',
    badges: ['Popular', 'GF'],
    customizable: true
  },
  {
    id: 'cur-massaman',
    name: 'Slow-Braised Massaman Beef Curry',
    category: 'Aromatic Curries',
    basePrice: 19.90,
    description: 'Mild southern Thai curry slow-cooked with tender beef, potato, star anise, cinnamon, and roasted cashews.',
    image: 'image/ThaiFood.jpg',
    badges: ['GF'],
    customizable: false
  },
  {
    id: 'wok-cashew',
    name: 'Cashew Nut & Sweet Chili Jam Stir-Fry',
    category: 'Wok Stir-Fries',
    basePrice: 18.50,
    description: 'Wok-tossed seasonal vegetables, roasted cashew nuts, and aromatic Thai sweet chili jam.',
    image: 'image/ThaiStyle.jpg',
    badges: ['Popular', 'Vegetarian'],
    customizable: true
  },
  {
    id: 'wok-basil',
    name: 'Spicy Holy Basil & Chili (Pad Kra Pao)',
    category: 'Wok Stir-Fries',
    basePrice: 18.50,
    description: 'Vibrant street-food favorite tossed at high wok heat with fresh chili, garlic, green beans, and fragrant holy basil.',
    image: 'image/ThaiFood.jpg',
    badges: ['Spicy'],
    customizable: true
  },
  {
    id: 'noo-pad-thai',
    name: 'Classic Pad Thai',
    category: 'Noodles & Rice',
    basePrice: 17.90,
    description: 'Chantaboon rice noodles wok-tossed in house tamarind reduction with egg, bean sprouts, chives, and crushed roasted peanuts.',
    image: 'image/ThaiStyle.jpg',
    badges: ['Popular', 'GF', 'Vegetarian'],
    customizable: true
  },
  {
    id: 'noo-pad-see-ew',
    name: 'Pad See Ew (Charred Flat Noodles)',
    category: 'Noodles & Rice',
    basePrice: 17.90,
    description: 'Wide flat rice noodles caramelized in sweet dark soy with crisp Chinese broccoli and egg.',
    image: 'image/HoanhThanh.jpg',
    badges: ['Vegetarian'],
    customizable: true
  },
  {
    id: 'noo-jasmine-rice',
    name: 'Steamed Fragrant Jasmine Rice',
    category: 'Noodles & Rice',
    basePrice: 4.00,
    description: 'Fluffy premium Thai Hom Mali jasmine rice steamed fresh.',
    image: 'image/ThaiFood.jpg',
    badges: ['GF', 'Vegetarian'],
    customizable: false
  },
  {
    id: 'drk-thai-milk-tea',
    name: 'Iced Thai Milk Tea (Cha Yen)',
    category: 'Drinks & Sides',
    basePrice: 6.50,
    description: 'Authentic Ceylon black tea brewed with star anise and sweetened condensed milk over ice.',
    image: 'image/HoanhThanh.jpg',
    badges: ['Popular', 'Vegetarian'],
    customizable: false
  }
];

document.addEventListener('DOMContentLoaded', () => {
  window.thaiStyleApp = new ThaiStyleApp(THAISTYLE_MENU_DATA);
});