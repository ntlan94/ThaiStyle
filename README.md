# Thai Style Irymple — Online Menu & Pickup Ordering System

> **Author & Maintainer:** Ngô Thành Lân (Thanh Lan Ngo) — [@ntlan94](https://github.com/ntlan94)  
> **Repository:** [github.com/ntlan94/ThaiStyle](https://github.com/ntlan94/ThaiStyle)  
> **Business Location:** Shop 4/2109–2111 Fifteenth Street, Irymple, Victoria 3498  
> **Kitchen Phone:** (03) 5024 5555

---

## 1. Project Overview

**Thai Style Irymple** is a responsive, zero-dependency static web application built with semantic HTML5, modular CSS Custom Properties, and vanilla Object-Oriented JavaScript (ES6 Classes).

It combines the warm saffron-and-obsidian brand identity of Thai Style with a functional **3-column Kaffenio-style online ordering board**:
1. **Left Category Panel & Top Pill Strip:** Instant category switching with live dish counts (`Featured`, `Entrées & Starters`, `Aromatic Curries`, `Wok Stir-Fries`, `Noodles & Rice`, `Drinks & Sides`).
2. **Center Dish Catalog:** Real-time keyword search, dietary filter chips (`Popular`, `Vegetarian Friendly`, `Gluten-Free Option`), dish cards, and a customization modal for protein and spice levels.
3. **Right Order & Pickup Drawer:** Reactive shopping cart with `Pickup` vs. `Dine-In` toggle, composite-key line item separation, device-based order persistence (`localStorage`), one-click **"Reload Last Order"**, and an instant plain-text kitchen docket generator.

---

## 2. Project Folder Structure

```text
ThaiStyle/
├── index.html                      # Main HTML5 structure & ordered OOP script loader
├── coreStyle.css                   # Global design tokens (CSS variables), resets, buttons & badges
├── style.css                       # Page sections, 3-column Kaffenio grid, modals & responsive rules
├── README.md                       # Project documentation & maintainer cheat sheet
├── image/                          # Local restaurant photography & brand assets
│   ├── ThaiStyleLogo.png
│   ├── phone.png
│   ├── HoanhThanh.jpg
│   ├── ThaiFood.jpg
│   └── ThaiStyle.jpg
└── js/
    ├── data/
    │   └── menuData.js             # Central menu catalog database (Edit dishes & prices here)
    ├── models/
    │   ├── MenuItem.js             # Domain model for a single restaurant dish
    │   └── CartItem.js             # Domain model for a customized cart line item
    ├── services/
    │   ├── StorageService.js       # LocalStorage wrapper (cart, customer details, order history)
    │   ├── MenuRepository.js       # Catalog query engine (category counts, search & dietary filters)
    │   └── CartManager.js          # Reactive Observer (Pub/Sub) cart state & kitchen docket builder
    ├── ui/
    │   ├── NavigationUI.js         # Sticky scroll header, mobile drawer & live store hours highlighter
    │   └── ThaiStyleApp.js         # Main DOM controller wiring UI events, modals & state engines
    └── main.js                     # Application entry point that boots ThaiStyleApp on DOMContentLoaded
