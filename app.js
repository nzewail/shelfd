/* ==========================================================================
   Shelfd — Reading Tracker PWA
   Main Application Logic
   ========================================================================== */

'use strict';

// ============================================================================
// 1. STORAGE MODULE
// ============================================================================
const bookStore = (() => {
  const STORAGE_KEY = 'shelfd_data';

  const getDefaultData = () => ({
    books: [],
    settings: {
      yearlyGoal: 12,
      theme: 'dark'
    }
  });

  const getData = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultData();
      const data = JSON.parse(raw);
      return { ...getDefaultData(), ...data };
    } catch {
      return getDefaultData();
    }
  };

  const saveData = (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  return {
    getBooks: () => getData().books,

    getBook: (id) => getData().books.find(b => b.id === id) || null,

    saveBook: (book) => {
      const data = getData();
      const newBook = {
        id: book.id || generateId(),
        title: book.title || 'Untitled',
        author: book.author || 'Unknown Author',
        coverUrl: book.coverUrl || '',
        pageCount: book.pageCount || 0,
        pagesRead: book.pagesRead || 0,
        status: book.status || 'want-to-read',
        format: book.format || 'physical',
        rating: book.rating || null,
        genres: book.genres || [],
        dateAdded: book.dateAdded || new Date().toISOString(),
        dateStarted: book.dateStarted || null,
        dateFinished: book.dateFinished || null,
        isbn: book.isbn || null,
        olKey: book.olKey || null
      };
      data.books.push(newBook);
      saveData(data);
      return newBook;
    },

    updateBook: (id, updates) => {
      const data = getData();
      const idx = data.books.findIndex(b => b.id === id);
      if (idx === -1) return null;
      data.books[idx] = { ...data.books[idx], ...updates };
      saveData(data);
      return data.books[idx];
    },

    deleteBook: (id) => {
      const data = getData();
      data.books = data.books.filter(b => b.id !== id);
      saveData(data);
    },

    getSettings: () => getData().settings,

    updateSettings: (updates) => {
      const data = getData();
      data.settings = { ...data.settings, ...updates };
      saveData(data);
      return data.settings;
    },

    exportData: () => JSON.stringify(getData(), null, 2),

    importData: (jsonString) => {
      const parsed = JSON.parse(jsonString);
      if (!parsed.books || !Array.isArray(parsed.books)) {
        throw new Error('Invalid data format: missing books array');
      }
      saveData({ ...getDefaultData(), ...parsed });
    },

    clearAll: () => {
      localStorage.removeItem(STORAGE_KEY);
    },

    generateId
  };
})();

// ============================================================================
// 2. API MODULE (Open Library)
// ============================================================================
const bookAPI = (() => {
  const SEARCH_URL = 'https://openlibrary.org/search.json';
  const COVER_URL = 'https://covers.openlibrary.org/b/id';

  const getCoverUrl = (coverId, size = 'M') => {
    if (!coverId) return '';
    return `${COVER_URL}/${coverId}-${size}.jpg`;
  };

  const mapSearchResult = (doc) => ({
    title: doc.title || 'Untitled',
    author: doc.author_name ? doc.author_name[0] : 'Unknown Author',
    coverUrl: getCoverUrl(doc.cover_i, 'M'),
    coverUrlLarge: getCoverUrl(doc.cover_i, 'L'),
    pageCount: doc.number_of_pages_median || 0,
    isbn: doc.isbn ? doc.isbn[0] : null,
    olKey: doc.key || null,
    firstPublishYear: doc.first_publish_year || null
  });

  let abortController = null;

  return {
    searchBooks: async (query) => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,isbn,number_of_pages_median,first_publish_year,subject`;

      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      return (data.docs || []).map(mapSearchResult);
    },

    getCoverUrl,
    cancelSearch: () => { if (abortController) abortController.abort(); }
  };
})();

// ============================================================================
// 3. TOAST MODULE
// ============================================================================
const toast = (() => {
  const container = () => document.getElementById('toast-container');

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  return {
    show: (message, type = 'info') => {
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span>${message}</span>
      `;
      container().appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }
  };
})();

// ============================================================================
// 4. MODAL MODULE
// ============================================================================
const modal = (() => {
  const overlay = () => document.getElementById('modal-overlay');
  const content = () => document.getElementById('modal-content');
  let hideTimeout = null;

  const show = (html) => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    content().innerHTML = html;
    overlay().classList.remove('hidden');
    // Use rAF to trigger CSS transition
    requestAnimationFrame(() => {
      overlay().classList.add('active');
    });
    document.body.style.overflow = 'hidden';
  };

  const hide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    overlay().classList.remove('active');
    // Wait for transition before hiding
    hideTimeout = setTimeout(() => {
      if (!overlay().classList.contains('active')) {
        overlay().classList.add('hidden');
      }
      hideTimeout = null;
    }, 300);
    document.body.style.overflow = '';
  };

  // Close on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') hide();
  });

  return { show, hide };
})();

// ============================================================================
// 5. ROUTER MODULE
// ============================================================================
const router = (() => {
  const views = ['library', 'search', 'stats', 'settings'];
  let currentView = 'library';

  const navigate = (view) => {
    if (!views.includes(view)) view = 'library';
    currentView = view;

    // Update views
    document.querySelectorAll('.view').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    // Update nav
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Update hash without triggering hashchange
    history.replaceState(null, '', `#${view}`);

    // Render the view
    if (view === 'library') ui.renderLibrary();
    if (view === 'stats') ui.renderStats();
    if (view === 'settings') ui.renderSettings();
  };

  const init = () => {
    const hash = location.hash.replace('#', '') || 'library';
    navigate(hash);
  };

  return { navigate, init, getCurrent: () => currentView };
})();

// ============================================================================
// 6. UI MODULE
// ============================================================================
const ui = (() => {
  let currentFilter = 'all';
  let currentSort = 'dateAdded-desc';

  // Preset genre list
  const GENRE_PRESETS = [
    'Fiction', 'Non-Fiction'
  ];

  // Helper to render genre tag picker
  const renderGenrePicker = (formId, selectedGenres = []) => {
    return `
      <div class="input-group">
        <label class="input-label">Genres</label>
        <div class="genre-tags" id="${formId}-genre-tags">
          ${GENRE_PRESETS.map(g => `
            <button type="button" class="genre-tag ${selectedGenres.includes(g) ? 'active' : ''}" data-genre="${g}">${g}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2);">
          <input type="text" id="${formId}-custom-genre" class="input-field" placeholder="Add custom genre..." style="flex:1;">
          <button type="button" id="${formId}-add-genre" class="btn btn-secondary" style="white-space:nowrap;">+ Add</button>
        </div>
        <div class="genre-tags" id="${formId}-custom-tags" style="margin-top:var(--space-2);">
          ${selectedGenres.filter(g => !GENRE_PRESETS.includes(g)).map(g => `
            <button type="button" class="genre-tag active" data-genre="${g}">${g} ✕</button>
          `).join('')}
        </div>
      </div>
    `;
  };

  // Helper to set up genre picker event listeners, returns getter function
  const setupGenrePicker = (formId, initialGenres = []) => {
    let selectedGenres = [...initialGenres];

    const updateTagUI = () => {
      document.querySelectorAll(`#${formId}-genre-tags .genre-tag`).forEach(tag => {
        tag.classList.toggle('active', selectedGenres.includes(tag.dataset.genre));
      });
    };

    // Preset tag clicks
    document.querySelectorAll(`#${formId}-genre-tags .genre-tag`).forEach(tag => {
      tag.addEventListener('click', () => {
        const genre = tag.dataset.genre;
        if (selectedGenres.includes(genre)) {
          selectedGenres = selectedGenres.filter(g => g !== genre);
        } else {
          selectedGenres.push(genre);
        }
        updateTagUI();
      });
    });

    // Custom tag clicks (remove)
    document.querySelectorAll(`#${formId}-custom-tags .genre-tag`).forEach(tag => {
      tag.addEventListener('click', () => {
        selectedGenres = selectedGenres.filter(g => g !== tag.dataset.genre);
        tag.remove();
      });
    });

    // Add custom genre
    const addCustom = () => {
      const input = document.getElementById(`${formId}-custom-genre`);
      const val = input.value.trim();
      if (val && !selectedGenres.includes(val)) {
        selectedGenres.push(val);
        // Add tag to custom tags container
        const customContainer = document.getElementById(`${formId}-custom-tags`);
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'genre-tag active';
        tag.dataset.genre = val;
        tag.textContent = `${val} ✕`;
        tag.addEventListener('click', () => {
          selectedGenres = selectedGenres.filter(g => g !== val);
          tag.remove();
        });
        customContainer.appendChild(tag);
        // Also highlight if it matches a preset
        updateTagUI();
      }
      input.value = '';
      input.focus();
    };

    document.getElementById(`${formId}-add-genre`).addEventListener('click', addCustom);
    document.getElementById(`${formId}-custom-genre`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
    });

    return () => selectedGenres;
  };

  // ---- Helpers ----
  const statusLabels = {
    'want-to-read': 'Want to Read',
    'reading': 'Reading',
    'finished': 'Finished',
    'dnf': 'DNF'
  };

  const statusBadgeClass = {
    'want-to-read': 'badge-want',
    'reading': 'badge-reading',
    'finished': 'badge-finished',
    'dnf': 'badge-dnf'
  };

  const formatLabels = {
    'physical': '📕 Physical',
    'audio': '🎧 Audio',
    'ebook': '📱 Ebook'
  };

  const formatIcons = {
    'physical': '📕',
    'audio': '🎧',
    'ebook': '📱'
  };

  const viewModes = ['standard', 'compact', 'large', 'list'];
  const viewModeIcons = { standard: '⊞', compact: '⣿', large: '🖼️', list: '☰' };
  const viewModeLabels = { standard: 'Standard Grid', compact: 'Compact Grid', large: 'Large Grid', list: 'List View' };
  let currentViewMode = localStorage.getItem('shelfd_view_mode') || 'standard';

  // ---- Library Rendering ----
  const renderLibrary = () => {
    const books = bookStore.getBooks();
    const grid = document.getElementById('book-grid');
    const emptyState = document.getElementById('empty-library');

    // Update view mode icon & grid class
    const iconEl = document.getElementById('view-mode-icon');
    if (iconEl) iconEl.textContent = viewModeIcons[currentViewMode];
    if (grid) {
      grid.className = 'book-grid';
      if (currentViewMode === 'compact') grid.classList.add('compact');
      if (currentViewMode === 'large') grid.classList.add('large');
      if (currentViewMode === 'list') grid.classList.add('list');
    }

    // Update view dropdown active state
    document.querySelectorAll('#view-dropdown .sort-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.viewMode === currentViewMode);
    });

    if (books.length === 0) {
      grid.classList.add('hidden');
      emptyState.classList.remove('hidden');
      emptyState.querySelector('.empty-title').textContent = 'Your shelf is empty';
      emptyState.querySelector('.empty-text').textContent = 'Search for books to start building your library';
      const btn = emptyState.querySelector('#btn-empty-search');
      if (btn) btn.classList.remove('hidden');
    } else if (currentFilter === 'all') {
      grid.classList.remove('hidden');
      emptyState.classList.add('hidden');

      let collapsedSections = JSON.parse(localStorage.getItem('shelfd_collapsed_sections') || '[]');

      const statuses = [
        { key: 'reading', label: '📖 Currently Reading' },
        { key: 'want-to-read', label: '✨ Want to Read' },
        { key: 'finished', label: '✅ Finished' },
        { key: 'dnf', label: '🚫 Did Not Finish' }
      ];

      const gridClass = `book-grid ${currentViewMode !== 'standard' ? currentViewMode : ''}`;

      const sectionsHtml = statuses.map(s => {
        const statusBooks = sortBooks(books.filter(b => b.status === s.key), currentSort);
        if (statusBooks.length === 0) return '';
        const isCollapsed = collapsedSections.includes(s.key);

        return `
          <div class="library-section ${isCollapsed ? 'collapsed' : ''}" data-section-key="${s.key}">
            <h3 class="library-section-title">
              <span>${s.label} (${statusBooks.length})</span>
              <span class="section-chevron">▼</span>
            </h3>
            <div class="${gridClass}">
              ${statusBooks.map(book => renderBookCard(book)).join('')}
            </div>
          </div>
        `;
      }).join('');

      grid.className = 'library-sections-container';
      grid.innerHTML = sectionsHtml;

      // Add collapse click listeners
      grid.querySelectorAll('.library-section-title').forEach(title => {
        title.addEventListener('click', (e) => {
          const section = e.target.closest('.library-section');
          if (section && section.dataset.sectionKey) {
            const key = section.dataset.sectionKey;
            let currentCollapsed = JSON.parse(localStorage.getItem('shelfd_collapsed_sections') || '[]');
            if (currentCollapsed.includes(key)) {
              currentCollapsed = currentCollapsed.filter(k => k !== key);
            } else {
              currentCollapsed.push(key);
            }
            localStorage.setItem('shelfd_collapsed_sections', JSON.stringify(currentCollapsed));
            section.classList.toggle('collapsed', currentCollapsed.includes(key));
          }
        });
      });
    } else {
      let filtered = sortBooks(books.filter(b => b.status === currentFilter), currentSort);

      if (filtered.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.querySelector('.empty-title').textContent = 'No books here';
        emptyState.querySelector('.empty-text').textContent = `You don't have any "${statusLabels[currentFilter]}" books yet`;
        const btn = emptyState.querySelector('#btn-empty-search');
        if (btn) btn.classList.add('hidden');
      } else {
        grid.classList.remove('hidden');
        emptyState.classList.add('hidden');
        grid.className = 'book-grid';
        if (currentViewMode === 'compact') grid.classList.add('compact');
        if (currentViewMode === 'large') grid.classList.add('large');
        if (currentViewMode === 'list') grid.classList.add('list');
        grid.innerHTML = filtered.map(book => renderBookCard(book)).join('');
      }
    }

    // Update filter bar active state
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.filter === currentFilter);
    });
  };

  const sortBooks = (books, sortKey) => {
    const [field, dir] = sortKey.split('-');
    const mult = dir === 'desc' ? -1 : 1;
    return [...books].sort((a, b) => {
      if (field === 'dateAdded') {
        return mult * (new Date(a.dateAdded) - new Date(b.dateAdded));
      }
      if (field === 'title' || field === 'author') {
        return mult * (a[field] || '').localeCompare(b[field] || '');
      }
      return 0;
    });
  };

  const renderBookCard = (book) => {
    const progress = book.pageCount > 0 ? Math.round((book.pagesRead / book.pageCount) * 100) : 0;
    const coverHtml = book.coverUrl
      ? `<img src="${book.coverUrl}" alt="${book.title}" class="book-cover" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'book-cover-placeholder\\'>📕</div>'">`
      : `<div class="book-cover-placeholder">📕</div>`;

    return `
      <article class="book-card" data-book-id="${book.id}" tabindex="0" role="button" aria-label="View ${book.title}">
        <div class="book-cover-container">
          ${coverHtml}
          <span class="format-badge">${formatIcons[book.format] || '📖'}</span>
          ${book.status === 'reading' && book.pageCount > 0 ? `
            <div class="card-progress-bar">
              <div class="card-progress-fill" style="width: ${progress}%"></div>
            </div>
          ` : ''}
        </div>
        <div class="book-info">
          <h3 class="book-title">${book.title}</h3>
          <p class="book-author">${book.author}</p>
          <div class="badge-container">
            <span class="badge ${statusBadgeClass[book.status]}">${statusLabels[book.status]}</span>
            ${book.rating ? `<span class="badge">${book.rating === 'liked' ? '👍' : '👎'}</span>` : ''}
          </div>
        </div>
      </article>
    `;
  };

  // ---- Search Rendering ----
  const renderSearchResults = (results) => {
    const container = document.getElementById('search-results');
    const empty = document.getElementById('search-empty');
    const noResults = document.getElementById('search-no-results');
    const loading = document.getElementById('search-loading');

    loading.classList.add('hidden');

    if (results.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      empty.classList.add('hidden');
      noResults.classList.remove('hidden');
      return;
    }

    noResults.classList.add('hidden');
    empty.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = results.map((book, i) => {
      const coverHtml = book.coverUrl
        ? `<img src="${book.coverUrl}" alt="${book.title}" class="search-result-cover" loading="lazy">`
        : `<div class="search-result-cover" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--text-tertiary);">📖</div>`;

      return `
        <div class="search-result-item" data-search-index="${i}" role="button" tabindex="0">
          ${coverHtml}
          <div class="search-result-info">
            <h4 class="search-result-title">${book.title}</h4>
            <p class="book-author" style="margin-bottom:var(--space-1)">${book.author}</p>
            ${book.firstPublishYear ? `<span class="text-xs text-tertiary">${book.firstPublishYear}</span>` : ''}
            ${book.pageCount ? `<span class="text-xs text-tertiary">${book.pageCount} pages</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  };

  const showSearchLoading = () => {
    document.getElementById('search-loading').classList.remove('hidden');
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('search-empty').classList.add('hidden');
    document.getElementById('search-no-results').classList.add('hidden');
  };

  const resetSearchView = () => {
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('search-loading').classList.add('hidden');
    document.getElementById('search-no-results').classList.add('hidden');
    document.getElementById('search-empty').classList.remove('hidden');
  };

  // ---- Book Detail Modal ----
  const showBookDetail = (bookId) => {
    const book = bookStore.getBook(bookId);
    if (!book) return;

    const progress = book.pageCount > 0 ? Math.round((book.pagesRead / book.pageCount) * 100) : 0;
    const coverHtml = book.coverUrl
      ? `<img src="${book.coverUrl}" alt="${book.title}" style="width:100%;max-width:200px;border-radius:var(--radius-md);margin:0 auto var(--space-4);display:block;">`
      : `<div style="width:200px;height:300px;margin:0 auto var(--space-4);display:flex;align-items:center;justify-content:center;background:var(--bg-elevated);border-radius:var(--radius-md);font-size:3rem;color:var(--text-tertiary);font-family:var(--font-heading);">📕</div>`;

    modal.show(`
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3 class="modal-title">Edit Book</h3>
        <button class="btn-close" id="modal-close-btn">✕</button>
      </div>

      ${coverHtml}
      <h3 style="text-align:center;margin-bottom:var(--space-1);font-family:var(--font-heading);">${book.title}</h3>
      <p style="text-align:center;color:var(--text-secondary);margin-bottom:var(--space-6);">${book.author}</p>

      <form id="book-edit-form" data-book-id="${book.id}">
        <!-- Status Selector -->
        <div class="input-group">
          <label class="input-label">Status</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
            ${['want-to-read', 'reading', 'finished', 'dnf'].map(s => `
              <button type="button" class="btn ${book.status === s ? 'btn-primary' : 'btn-secondary'} status-select-btn" data-status="${s}" style="font-size:var(--text-sm);">
                ${statusLabels[s]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Format Selector -->
        <div class="input-group">
          <label class="input-label">Format</label>
          <div style="display:flex;gap:var(--space-2);">
            ${['physical', 'audio', 'ebook'].map(f => `
              <button type="button" class="btn ${book.format === f ? 'btn-primary' : 'btn-secondary'} format-select-btn" data-format="${f}" style="flex:1;font-size:var(--text-sm);">
                ${formatLabels[f]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Pages -->
        <div class="input-group">
          <label class="input-label">Pages Read</label>
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <input type="number" id="edit-pages-read" class="input-field" value="${book.pagesRead}" min="0" max="${book.pageCount || 99999}" style="flex:1;">
            <span style="color:var(--text-secondary);">of</span>
            <input type="number" id="edit-page-count" class="input-field" value="${book.pageCount}" min="0" style="flex:1;">
          </div>
          ${book.pageCount > 0 ? `
            <div style="width:100%;height:6px;background:var(--bg-elevated);border-radius:3px;margin-top:var(--space-2);overflow:hidden;">
              <div style="width:${progress}%;height:100%;background:var(--accent-secondary);border-radius:3px;transition:width 0.3s;"></div>
            </div>
            <span class="text-xs text-secondary">${progress}% complete</span>
          ` : ''}
        </div>

        <!-- Genres -->
        ${renderGenrePicker('edit', book.genres || [])}

        <!-- Rating -->
        <div class="input-group">
          <label class="input-label">Rating</label>
          <div class="rating-group">
            <button type="button" class="rating-btn ${book.rating === 'liked' ? 'active-up' : ''}" data-rating="liked">👍</button>
            <button type="button" class="rating-btn ${book.rating === 'disliked' ? 'active-down' : ''}" data-rating="disliked">👎</button>
          </div>
        </div>

        <!-- Dates -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div class="input-group">
            <label class="input-label">Started</label>
            <input type="date" id="edit-date-started" class="input-field" value="${book.dateStarted ? book.dateStarted.split('T')[0] : ''}">
          </div>
          <div class="input-group">
            <label class="input-label">Finished</label>
            <input type="date" id="edit-date-finished" class="input-field" value="${book.dateFinished ? book.dateFinished.split('T')[0] : ''}">
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
          <button type="submit" class="btn btn-primary btn-lg" style="flex:1;">Save Changes</button>
        </div>
        <button type="button" id="btn-delete-book" class="btn" style="width:100%;margin-top:var(--space-3);color:var(--status-dnf);font-size:var(--text-sm);">
          Delete Book
        </button>
      </form>
    `);

    setupBookEditListeners(book);
  };

  // ---- Add Book Modal ----
  const showAddBookModal = (searchResult) => {

    const coverHtml = searchResult.coverUrlLarge || searchResult.coverUrl
      ? `<img src="${searchResult.coverUrlLarge || searchResult.coverUrl}" alt="${searchResult.title}" style="width:100%;max-width:180px;border-radius:var(--radius-md);margin:0 auto var(--space-4);display:block;">`
      : `<div style="width:180px;height:270px;margin:0 auto var(--space-4);display:flex;align-items:center;justify-content:center;background:var(--bg-elevated);border-radius:var(--radius-md);font-size:3rem;color:var(--text-tertiary);font-family:var(--font-heading);">📕</div>`;

    const defaultPageCount = searchResult.pageCount || 0;

    modal.show(`
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3 class="modal-title">Add to Library</h3>
        <button class="btn-close" id="modal-close-btn">✕</button>
      </div>

      ${coverHtml}
      <h3 style="text-align:center;margin-bottom:var(--space-1);font-family:var(--font-heading);">${searchResult.title}</h3>
      <p style="text-align:center;color:var(--text-secondary);margin-bottom:var(--space-4);">${searchResult.author}</p>

      <form id="book-add-form">
        <!-- Status Selector -->
        <div class="input-group">
          <label class="input-label">Status</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
            ${['want-to-read', 'reading', 'finished', 'dnf'].map(s => `
              <button type="button" class="btn ${s === 'want-to-read' ? 'btn-primary' : 'btn-secondary'} status-select-btn" data-status="${s}" style="font-size:var(--text-sm);">
                ${statusLabels[s]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Format Selector -->
        <div class="input-group">
          <label class="input-label">Format</label>
          <div style="display:flex;gap:var(--space-2);">
            ${['physical', 'audio', 'ebook'].map(f => `
              <button type="button" class="btn ${f === 'physical' ? 'btn-primary' : 'btn-secondary'} format-select-btn" data-format="${f}" style="flex:1;font-size:var(--text-sm);">
                ${formatLabels[f]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Pages -->
        <div class="input-group">
          <label class="input-label">Pages</label>
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <input type="number" id="add-pages-read" class="input-field" value="0" min="0" placeholder="Pages Read" style="flex:1;">
            <span style="color:var(--text-secondary);">of</span>
            <input type="number" id="add-page-count" class="input-field" value="${defaultPageCount}" min="0" placeholder="Total Pages" style="flex:1;">
          </div>
        </div>

        <!-- Rating -->
        <div class="input-group">
          <label class="input-label">Rating</label>
          <div class="rating-group">
            <button type="button" class="rating-btn" data-rating="liked">👍</button>
            <button type="button" class="rating-btn" data-rating="disliked">👎</button>
          </div>
        </div>

        <!-- Genres -->
        ${renderGenrePicker('add', [])}

        <!-- Dates -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div class="input-group">
            <label class="input-label">Started</label>
            <input type="date" id="add-date-started" class="input-field" value="">
          </div>
          <div class="input-group">
            <label class="input-label">Finished</label>
            <input type="date" id="add-date-finished" class="input-field" value="">
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;margin-top:var(--space-4);">
          Add to Library
        </button>
      </form>
    `);

    // Setup event listeners for the add modal
    let selectedStatus = 'want-to-read';
    let selectedFormat = 'physical';
    let selectedRating = null;
    const getSelectedAddGenres = setupGenrePicker('add', []);

    document.getElementById('modal-close-btn').addEventListener('click', modal.hide);

    // Rating buttons
    document.querySelectorAll('#book-add-form .rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.rating;
        selectedRating = selectedRating === val ? null : val;
        document.querySelectorAll('#book-add-form .rating-btn').forEach(b => {
          b.classList.remove('active-up', 'active-down');
          if (b.dataset.rating === selectedRating) {
            b.classList.add(selectedRating === 'liked' ? 'active-up' : 'active-down');
          }
        });
      });
    });

    document.querySelectorAll('#book-add-form .status-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedStatus = btn.dataset.status;
        document.querySelectorAll('#book-add-form .status-select-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.dataset.status === selectedStatus);
          b.classList.toggle('btn-secondary', b.dataset.status !== selectedStatus);
        });

        // Auto-fill dates & pages based on status if unset
        const pageCountVal = parseInt(document.getElementById('add-page-count').value) || 0;
        const pagesReadInput = document.getElementById('add-pages-read');
        const dateStartedInput = document.getElementById('add-date-started');
        const dateFinishedInput = document.getElementById('add-date-finished');
        const today = new Date().toISOString().split('T')[0];

        if (selectedStatus === 'finished') {
          if (!pagesReadInput.value || pagesReadInput.value === '0') pagesReadInput.value = pageCountVal;
          if (!dateFinishedInput.value) dateFinishedInput.value = today;
          if (!dateStartedInput.value) dateStartedInput.value = today;
        } else if (selectedStatus === 'reading') {
          if (!dateStartedInput.value) dateStartedInput.value = today;
        }
      });
    });

    document.querySelectorAll('#book-add-form .format-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFormat = btn.dataset.format;
        document.querySelectorAll('#book-add-form .format-select-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.dataset.format === selectedFormat);
          b.classList.toggle('btn-secondary', b.dataset.format !== selectedFormat);
        });
      });
    });

    document.getElementById('book-add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pageCount = parseInt(document.getElementById('add-page-count').value) || 0;
      const pagesRead = parseInt(document.getElementById('add-pages-read').value) || 0;
      const dateStarted = document.getElementById('add-date-started').value;
      const dateFinished = document.getElementById('add-date-finished').value;
      const now = new Date().toISOString();

      bookStore.saveBook({
        title: searchResult.title,
        author: searchResult.author,
        coverUrl: searchResult.coverUrl,
        pageCount: pageCount,
        pagesRead: Math.min(pagesRead, pageCount || pagesRead),
        status: selectedStatus,
        format: selectedFormat,
        rating: selectedRating,
        genres: getSelectedAddGenres(),
        isbn: searchResult.isbn,
        olKey: searchResult.olKey,
        dateAdded: now,
        dateStarted: dateStarted ? new Date(dateStarted).toISOString() : (selectedStatus === 'reading' || selectedStatus === 'finished' ? now : null),
        dateFinished: dateFinished ? new Date(dateFinished).toISOString() : (selectedStatus === 'finished' ? now : null)
      });
      modal.hide();
      toast.show(`"${searchResult.title}" added to library!`, 'success');
      if (router.getCurrent() === 'library') renderLibrary();
    });
  };

  // ---- Book Edit Listeners ----
  const setupBookEditListeners = (book) => {
    let editStatus = book.status;
    let editFormat = book.format;
    let editRating = book.rating;
    const getSelectedEditGenres = setupGenrePicker('edit', book.genres || []);

    document.getElementById('modal-close-btn').addEventListener('click', modal.hide);

    // Status buttons
    document.querySelectorAll('#book-edit-form .status-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editStatus = btn.dataset.status;
        document.querySelectorAll('#book-edit-form .status-select-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.dataset.status === editStatus);
          b.classList.toggle('btn-secondary', b.dataset.status !== editStatus);
        });
      });
    });

    // Format buttons
    document.querySelectorAll('#book-edit-form .format-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editFormat = btn.dataset.format;
        document.querySelectorAll('#book-edit-form .format-select-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.dataset.format === editFormat);
          b.classList.toggle('btn-secondary', b.dataset.format !== editFormat);
        });
      });
    });

    // Rating buttons
    document.querySelectorAll('#book-edit-form .rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.rating;
        editRating = editRating === val ? null : val;
        document.querySelectorAll('#book-edit-form .rating-btn').forEach(b => {
          b.classList.remove('active-up', 'active-down');
          if (b.dataset.rating === editRating) {
            b.classList.add(editRating === 'liked' ? 'active-up' : 'active-down');
          }
        });
      });
    });

    // Save form
    document.getElementById('book-edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pagesRead = parseInt(document.getElementById('edit-pages-read').value) || 0;
      const pageCount = parseInt(document.getElementById('edit-page-count').value) || 0;
      const dateStarted = document.getElementById('edit-date-started').value;
      const dateFinished = document.getElementById('edit-date-finished').value;

      bookStore.updateBook(book.id, {
        status: editStatus,
        format: editFormat,
        rating: editRating,
        genres: getSelectedEditGenres(),
        pagesRead: Math.min(pagesRead, pageCount || pagesRead),
        pageCount,
        dateStarted: dateStarted ? new Date(dateStarted).toISOString() : null,
        dateFinished: dateFinished ? new Date(dateFinished).toISOString() : null
      });

      modal.hide();
      toast.show('Book updated!', 'success');
      if (router.getCurrent() === 'library') renderLibrary();
    });

    // Delete button
    document.getElementById('btn-delete-book').addEventListener('click', () => {
      showConfirmModal(
        'Delete this book?',
        'This action cannot be undone.',
        () => {
          bookStore.deleteBook(book.id);
          modal.hide();
          toast.show('Book removed from library', 'info');
          if (router.getCurrent() === 'library') renderLibrary();
        }
      );
    });
  };

  // ---- Confirm Modal ----
  const showConfirmModal = (title, message, onConfirm) => {
    modal.show(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:var(--space-4) 0;">
        <h3 style="font-family:var(--font-heading);margin-bottom:var(--space-3);">${title}</h3>
        <p style="color:var(--text-secondary);margin-bottom:var(--space-6);">${message}</p>
        <div style="display:flex;gap:var(--space-3);">
          <button class="btn btn-secondary btn-lg" style="flex:1;" id="confirm-cancel">Cancel</button>
          <button class="btn btn-lg" style="flex:1;background:var(--status-dnf);color:white;" id="confirm-yes">Delete</button>
        </div>
      </div>
    `);
    document.getElementById('confirm-cancel').addEventListener('click', modal.hide);
    document.getElementById('confirm-yes').addEventListener('click', () => {
      onConfirm();
    });
  };

  // ---- Stats Rendering ----
  const renderStats = () => {
    const books = bookStore.getBooks();
    const settings = bookStore.getSettings();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const statsEmpty = document.getElementById('stats-empty');
    const statsGoal = document.getElementById('stats-goal');
    const statsGrid = document.getElementById('stats-grid');

    if (books.length === 0) {
      statsEmpty.classList.remove('hidden');
      statsGoal.classList.add('hidden');
      statsGrid.classList.add('hidden');
      document.querySelectorAll('.stats-section').forEach(el => el.classList.add('hidden'));
      return;
    }

    statsEmpty.classList.add('hidden');
    statsGoal.classList.remove('hidden');
    statsGrid.classList.remove('hidden');
    document.querySelectorAll('.stats-section').forEach(el => el.classList.remove('hidden'));

    // Calculate stats - exclude 'want-to-read' books from reading stats
    const trackedBooks = books.filter(b => b.status !== 'want-to-read');
    const finished = books.filter(b => b.status === 'finished');
    const finishedThisYear = finished.filter(b => b.dateFinished && new Date(b.dateFinished).getFullYear() === currentYear);
    const finishedThisMonth = finishedThisYear.filter(b => new Date(b.dateFinished).getMonth() === currentMonth);

    const totalPages = finished.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const readingBooks = books.filter(b => b.status === 'reading');
    const readingPages = readingBooks.reduce((sum, b) => sum + (b.pagesRead || 0), 0);
    const dnfBooks = books.filter(b => b.status === 'dnf');
    const dnfPages = dnfBooks.reduce((sum, b) => sum + (b.pagesRead || 0), 0);

    // Average days to finish
    const finishTimes = finished
      .filter(b => b.dateStarted && b.dateFinished)
      .map(b => {
        const start = new Date(b.dateStarted);
        const end = new Date(b.dateFinished);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      })
      .filter(d => d >= 0);

    const avgDays = finishTimes.length > 0
      ? Math.round(finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length)
      : null;

    // Ratings
    const liked = books.filter(b => b.rating === 'liked').length;
    const disliked = books.filter(b => b.rating === 'disliked').length;

    // Update stat cards (Total Books counts Finished, Reading & DNF)
    document.getElementById('stat-total-books').textContent = trackedBooks.length;
    document.getElementById('stat-year-books').textContent = finishedThisYear.length;
    document.getElementById('stat-month-books').textContent = finishedThisMonth.length;
    document.getElementById('stat-total-pages').textContent = (totalPages + readingPages + dnfPages).toLocaleString();
    document.getElementById('stat-avg-days').textContent = avgDays !== null ? avgDays : '—';
    if (document.getElementById('stat-dnf-books')) {
      document.getElementById('stat-dnf-books').textContent = dnfBooks.length;
    }
    document.getElementById('stat-liked').textContent = liked;
    document.getElementById('stat-disliked').textContent = disliked;

    // Goal progress ring
    const goalCount = finishedThisYear.length;
    const goalTotal = settings.yearlyGoal || 12;
    const goalPercent = Math.min(100, Math.round((goalCount / goalTotal) * 100));

    document.getElementById('goal-count').textContent = goalCount;
    document.getElementById('goal-total').textContent = goalTotal;

    const ring = document.getElementById('goal-ring-progress');
    if (ring) {
      const circumference = 2 * Math.PI * 52;
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = circumference - (goalPercent / 100) * circumference;
    }

    const goalMsg = document.getElementById('goal-message');
    if (goalPercent >= 100) {
      goalMsg.textContent = '🎉 Goal reached!';
    } else if (goalPercent >= 75) {
      goalMsg.textContent = 'Almost there! Keep going!';
    } else if (goalPercent >= 50) {
      goalMsg.textContent = 'Halfway there! 📖';
    } else {
      goalMsg.textContent = `${goalTotal - goalCount} more to go`;
    }

    // Update year label
    document.getElementById('stats-year-label').textContent = currentYear;

    // Render monthly chart
    renderMonthlyChart(finishedThisYear);

    // Render format breakdown (only for touched books)
    renderFormatBreakdown(trackedBooks);

    // Render genre breakdown (only for touched books)
    renderGenreBreakdown(trackedBooks);

    // Render page count breakdown (for finished books)
    renderPageCountBreakdown(finished);

    // Add interactive click listeners for stat cards & monthly bars
    setupStatsInteractivity(finishedThisYear, finishedThisMonth, trackedBooks, dnfBooks);
  };

  const showBookListModal = (title, bookList) => {
    if (!bookList || bookList.length === 0) {
      toast.show(`No books for ${title}`, 'info');
      return;
    }

    const booksHtml = bookList.map(book => {
      const coverHtml = book.coverUrl
        ? `<img src="${book.coverUrl}" alt="${book.title}" style="width:40px;height:60px;object-fit:cover;border-radius:var(--radius-sm);margin-right:var(--space-3);">`
        : `<div style="width:40px;height:60px;background:var(--bg-elevated);border-radius:var(--radius-sm);margin-right:var(--space-3);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📕</div>`;

      return `
        <div class="stat-book-item" data-book-id="${book.id}" style="display:flex;align-items:center;padding:var(--space-3);background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-2);cursor:pointer;">
          ${coverHtml}
          <div style="flex:1;">
            <div style="font-weight:var(--weight-semibold);font-family:var(--font-heading);">${book.title}</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">${book.author}</div>
          </div>
          <span class="badge ${statusBadgeClass[book.status]}">${statusLabels[book.status]}</span>
        </div>
      `;
    }).join('');

    modal.show(`
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3 class="modal-title">${title} (${bookList.length})</h3>
        <button class="btn-close" id="modal-close-btn">✕</button>
      </div>
      <div style="max-height:60vh;overflow-y:auto;padding-right:4px;">
        ${booksHtml}
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', modal.hide);
    document.querySelectorAll('.stat-book-item').forEach(item => {
      item.addEventListener('click', () => {
        showBookDetail(item.dataset.bookId);
      });
    });
  };

  const setupStatsInteractivity = (finishedThisYear, finishedThisMonth, allBooks, dnfBooks = []) => {
    // Total books card
    const cardTotal = document.getElementById('stat-total-books')?.closest('.stat-card');
    if (cardTotal) {
      cardTotal.style.cursor = 'pointer';
      cardTotal.onclick = () => showBookListModal('All Books', allBooks);
    }

    // This year card
    const cardYear = document.getElementById('stat-year-books')?.closest('.stat-card');
    if (cardYear) {
      cardYear.style.cursor = 'pointer';
      cardYear.onclick = () => showBookListModal('Finished This Year', finishedThisYear);
    }

    // This month card
    const cardMonth = document.getElementById('stat-month-books')?.closest('.stat-card');
    if (cardMonth) {
      cardMonth.style.cursor = 'pointer';
      cardMonth.onclick = () => showBookListModal('Finished This Month', finishedThisMonth);
    }

    // DNF books card
    const cardDnf = document.getElementById('stat-dnf-books')?.closest('.stat-card');
    if (cardDnf) {
      cardDnf.style.cursor = 'pointer';
      cardDnf.onclick = () => showBookListModal('DNF (Did Not Finish) Books', dnfBooks);
    }

    // Monthly chart bars
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    document.querySelectorAll('.bar-group').forEach((barGroup, idx) => {
      barGroup.style.cursor = 'pointer';
      barGroup.onclick = () => {
        const booksInMonth = finishedThisYear.filter(b => b.dateFinished && new Date(b.dateFinished).getMonth() === idx);
        showBookListModal(`Books Finished in ${months[idx]}`, booksInMonth);
      };
    });
  };

  const renderMonthlyChart = (finishedThisYear) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyCounts = new Array(12).fill(0);

    finishedThisYear.forEach(b => {
      if (b.dateFinished) {
        const month = new Date(b.dateFinished).getMonth();
        monthlyCounts[month]++;
      }
    });

    const maxCount = Math.max(...monthlyCounts, 1);
    const midCount = Math.round(maxCount / 2);
    const chart = document.getElementById('monthly-chart');

    chart.innerHTML = `
      <div class="chart-wrapper">
        <div class="chart-y-axis">
          <span>${maxCount}</span>
          <span>${midCount > 0 && midCount < maxCount ? midCount : ''}</span>
          <span>0</span>
        </div>
        <div class="chart-area">
          <div class="chart-gridlines">
            <div class="gridline"></div>
            <div class="gridline"></div>
            <div class="gridline"></div>
          </div>
          <div class="bar-chart">
            ${months.map((m, i) => `
              <div class="bar-group" title="Click to view ${monthlyCounts[i]} book${monthlyCounts[i] !== 1 ? 's' : ''} in ${m}">
                <div class="bar" style="height: ${(monthlyCounts[i] / maxCount) * 100}%;"></div>
                <span class="bar-label">${m}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  };

  const renderFormatBreakdown = (books) => {
    const container = document.getElementById('format-breakdown');
    const formats = { physical: 0, audio: 0, ebook: 0 };
    books.forEach(b => { if (formats[b.format] !== undefined) formats[b.format]++; });
    const total = books.length || 1;

    container.innerHTML = Object.entries(formats).map(([fmt, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="format-item" data-format="${fmt}" style="margin-bottom:var(--space-3);cursor:pointer;" title="Click to view ${formatLabels[fmt]} books">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1);">
            <span style="font-size:var(--text-sm);">${formatLabels[fmt]}</span>
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">${count} (${pct}%)</span>
          </div>
          <div style="width:100%;height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:var(--accent-secondary);border-radius:4px;transition:width 0.5s;"></div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.format-item').forEach(item => {
      item.addEventListener('click', () => {
        const fmt = item.dataset.format;
        const matchingBooks = books.filter(b => b.format === fmt);
        showBookListModal(`${formatLabels[fmt]} Books`, matchingBooks);
      });
    });
  };

  const renderGenreBreakdown = (books) => {
    const container = document.getElementById('genre-breakdown');
    const genreCounts = {};
    books.forEach(b => {
      (b.genres || []).forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (topGenres.length === 0) {
      container.innerHTML = '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No genre data yet</p>';
      return;
    }

    const maxGenre = topGenres[0][1];
    const total = books.length || 1;

    container.innerHTML = topGenres.map(([genre, count]) => {
      const barPct = Math.round((count / maxGenre) * 100);
      const genrePct = Math.round((count / total) * 100);
      return `
        <div class="genre-item" data-genre="${genre}" style="margin-bottom:var(--space-3);cursor:pointer;" title="Click to view ${genre} books">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1);">
            <span style="font-size:var(--text-sm);text-transform:capitalize;">${genre}</span>
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">${count} (${genrePct}%)</span>
          </div>
          <div style="width:100%;height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:var(--accent-primary);border-radius:4px;transition:width 0.5s;"></div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.genre-item').forEach(item => {
      item.addEventListener('click', () => {
        const genre = item.dataset.genre;
        const matchingBooks = books.filter(b => (b.genres || []).includes(genre));
        showBookListModal(`${genre} Books`, matchingBooks);
      });
    });
  };

  const renderPageCountBreakdown = (finishedBooks) => {
    const container = document.getElementById('pages-breakdown');
    if (!container) return;

    const buckets = [
      { label: '< 200 pgs', filter: b => (b.pageCount || 0) < 200 },
      { label: '200–300 pgs', filter: b => (b.pageCount || 0) >= 200 && (b.pageCount || 0) < 300 },
      { label: '300–400 pgs', filter: b => (b.pageCount || 0) >= 300 && (b.pageCount || 0) < 400 },
      { label: '400–500 pgs', filter: b => (b.pageCount || 0) >= 400 && (b.pageCount || 0) < 500 },
      { label: '500+ pgs', filter: b => (b.pageCount || 0) >= 500 }
    ];

    const total = finishedBooks.length || 1;

    buckets.forEach(bucket => {
      bucket.books = finishedBooks.filter(bucket.filter);
      bucket.count = bucket.books.length;
    });

    if (finishedBooks.length === 0) {
      container.innerHTML = '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No finished books yet</p>';
      return;
    }

    const maxBucketCount = Math.max(...buckets.map(b => b.count), 1);

    container.innerHTML = buckets.map(b => {
      const pct = Math.round((b.count / total) * 100);
      const barPct = Math.round((b.count / maxBucketCount) * 100);
      return `
        <div class="page-bucket-item" data-bucket-label="${b.label}" style="margin-bottom:var(--space-3);cursor:pointer;" title="Click to view ${b.label} books">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1);">
            <span style="font-size:var(--text-sm);">${b.label}</span>
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">${b.count} (${pct}%)</span>
          </div>
          <div style="width:100%;height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:var(--accent-secondary);border-radius:4px;transition:width 0.5s;"></div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.page-bucket-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        const bucket = buckets[idx];
        showBookListModal(`Finished Books (${bucket.label})`, bucket.books);
      });
    });
  };

  // ---- Settings Rendering ----
  const renderSettings = () => {
    const settings = bookStore.getSettings();
    document.getElementById('setting-yearly-goal').value = settings.yearlyGoal || 12;
  };

  // ---- Public API ----
  return {
    renderLibrary,
    renderSearchResults,
    showSearchLoading,
    resetSearchView,
    renderStats,
    renderSettings,
    showBookDetail,
    showAddBookModal,
    showConfirmModal,
    setFilter: (filter) => { currentFilter = filter; renderLibrary(); },
    setSort: (sort) => { currentSort = sort; renderLibrary(); },
    setViewMode: (mode) => {
      if (viewModes.includes(mode)) {
        currentViewMode = mode;
        localStorage.setItem('shelfd_view_mode', mode);
        renderLibrary();
      }
    },
    getFilter: () => currentFilter,
    getSort: () => currentSort
  };
})();

// ============================================================================
// 7. EVENT HANDLERS
// ============================================================================
const initEventHandlers = () => {
  // ---- Navigation ----
  document.getElementById('nav').addEventListener('click', (e) => {
    const tab = e.target.closest('.nav-tab');
    if (tab) router.navigate(tab.dataset.view);
  });

  // ---- Filter Bar ----
  document.getElementById('filter-bar').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (pill) ui.setFilter(pill.dataset.filter);
  });

  // ---- View Mode Dropdown ----
  const btnViewMode = document.getElementById('btn-view-mode');
  if (btnViewMode) {
    btnViewMode.addEventListener('click', () => {
      document.getElementById('sort-dropdown').classList.add('hidden');
      document.getElementById('view-dropdown').classList.toggle('hidden');
    });
  }

  document.getElementById('view-dropdown').addEventListener('click', (e) => {
    const option = e.target.closest('.sort-option');
    if (option) {
      ui.setViewMode(option.dataset.viewMode);
      document.getElementById('view-dropdown').classList.add('hidden');
    }
  });

  // ---- Sort Dropdown ----
  document.getElementById('btn-sort').addEventListener('click', () => {
    document.getElementById('view-dropdown').classList.add('hidden');
    document.getElementById('sort-dropdown').classList.toggle('hidden');
  });

  document.getElementById('sort-dropdown').addEventListener('click', (e) => {
    const option = e.target.closest('.sort-option');
    if (option) {
      document.querySelectorAll('.sort-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      ui.setSort(option.dataset.sort);
      document.getElementById('sort-dropdown').classList.add('hidden');
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btn-sort') && !e.target.closest('#sort-dropdown')) {
      document.getElementById('sort-dropdown').classList.add('hidden');
    }
    if (!e.target.closest('#btn-view-mode') && !e.target.closest('#view-dropdown')) {
      document.getElementById('view-dropdown').classList.add('hidden');
    }
  });

  // ---- Book Card Clicks ----
  document.getElementById('book-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if (card) ui.showBookDetail(card.dataset.bookId);
  });

  // ---- Search ----
  let searchTimeout = null;
  let lastSearchResults = [];

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    searchClear.classList.toggle('hidden', !query);

    if (!query) {
      ui.resetSearchView();
      return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      ui.showSearchLoading();
      try {
        lastSearchResults = await bookAPI.searchBooks(query);
        ui.renderSearchResults(lastSearchResults);
      } catch (err) {
        if (err.name !== 'AbortError') {
          toast.show('Search failed. Check your connection.', 'error');
          ui.resetSearchView();
        }
      }
    }, 400);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    ui.resetSearchView();
    searchInput.focus();
  });

  // ---- Search Result Clicks ----
  document.getElementById('search-results').addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      const idx = parseInt(item.dataset.searchIndex);
      if (lastSearchResults[idx]) {
        ui.showAddBookModal(lastSearchResults[idx]);
      }
    }
  });

  // ---- Empty State Search Button ----
  document.getElementById('btn-empty-search').addEventListener('click', () => {
    router.navigate('search');
    setTimeout(() => document.getElementById('search-input').focus(), 100);
  });

  // ---- Settings ----
  document.getElementById('setting-yearly-goal').addEventListener('change', (e) => {
    const val = parseInt(e.target.value) || 12;
    bookStore.updateSettings({ yearlyGoal: Math.max(1, Math.min(365, val)) });
    toast.show('Reading goal updated!', 'success');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const data = bookStore.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shelfd-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show('Data exported!', 'success');
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        // Validate first
        JSON.parse(text);
        ui.showConfirmModal(
          'Import Data?',
          'This will replace all your current books and settings.',
          () => {
            try {
              bookStore.importData(text);
              modal.hide();
              toast.show('Data imported successfully!', 'success');
              ui.renderLibrary();
            } catch (err) {
              toast.show('Import failed: Invalid data format', 'error');
            }
          }
        );
      } catch {
        toast.show('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  });

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    ui.showConfirmModal(
      'Clear All Data?',
      'This will permanently delete all your books and settings. This cannot be undone.',
      () => {
        bookStore.clearAll();
        modal.hide();
        toast.show('All data cleared', 'info');
        ui.renderLibrary();
      }
    );
  });

  // ---- Keyboard: Escape closes modal ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.hide();
  });
};

// ============================================================================
// 8. SERVICE WORKER REGISTRATION
// ============================================================================
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }
};

// ============================================================================
// 9. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initEventHandlers();
  router.init();
  registerServiceWorker();
});
