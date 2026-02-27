/**
 * Onvord Premium Landing Page - Interactions & i18n
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Internationalization (i18n) ---
    const langToggleBtn = document.getElementById('lang-toggle');

    // Default language: Check localStorage, then browser language, fallback to 'en'
    let currentLang = localStorage.getItem('onvord_lang');
    if (!currentLang) {
        const browserLang = navigator.language || navigator.userLanguage;
        currentLang = browserLang.startsWith('zh') ? 'zh' : 'en';
    }

    function applyLanguage(lang) {
        const dict = translations[lang];
        if (!dict) return;

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                // Use innerHTML to support <br> tags in strings like hero_title
                el.innerHTML = dict[key];
            }
        });

        // Update HTML lang attribute
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

        // Save preference
        localStorage.setItem('onvord_lang', lang);
    }

    // Initial apply
    applyLanguage(currentLang);

    // Toggle handler
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'zh' : 'en';
            applyLanguage(currentLang);
        });
    }

    // --- 2. Scroll Reveal Animations (Minimalist easing) ---
    const revealElements = document.querySelectorAll('.slide-up-reveal');

    const revealOptions = {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: "0px 0px -50px 0px"
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // --- 3. Smooth Scrolling for Anchor Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
