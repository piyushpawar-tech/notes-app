/* ==========================================================================
   Markdown Notes Manager — app.js
   Vanilla JS, no build step. Everything persists to localStorage.
   ========================================================================== */

(function () {
  "use strict";

  // ---- Config -------------------------------------------------------------
  const STORAGE_KEY = "marginal:notes";
  const AUTOSAVE_DELAY_MS = 400; // debounce delay after the user stops typing

  // marked.js options: keep line breaks as <br>, matching how people expect
  // plain markdown notes to behave.
  marked.setOptions({ breaks: true, gfm: true });

  // ---- DOM references -------------------------------------------------------
  const el = {
    noteList: document.getElementById("noteList"),
    sidebarEmpty: document.getElementById("sidebarEmpty"),
    sidebar: document.getElementById("sidebar"),
    menuToggle: document.getElementById("menuToggle"),
    newNoteBtn: document.getElementById("newNoteBtn"),
    deleteNoteBtn: document.getElementById("deleteNoteBtn"),
    titleInput: document.getElementById("titleInput"),
    markdownInput: document.getElementById("markdownInput"),
    markdownPreview: document.getElementById("markdownPreview"),
    saveIndicator: document.getElementById("saveIndicator"),
    wordCount: document.getElementById("wordCount"),
    charCount: document.getElementById("charCount"),
    updatedAt: document.getElementById("updatedAt"),
  };

  // ---- State ----------------------------------------------------------------
  let notes = [];            // array of { id, title, content, updatedAt }
  let activeNoteId = null;
  let autosaveTimer = null;

  // ============================================================================
  // PERSISTENCE (localStorage)
  // ============================================================================

  /** Load all notes from localStorage. Returns [] if none exist or data is corrupt. */
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Failed to read notes from localStorage:", err);
      return [];
    }
  }

  /** Persist the current notes array to localStorage. */
  function persistNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (err) {
      console.error("Failed to save notes to localStorage:", err);
    }
  }

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  function createNote() {
    const note = {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title: "",
      content: "",
      updatedAt: Date.now(),
    };
    notes.unshift(note);
    persistNotes();
    activeNoteId = note.id;
    renderNoteList();
    loadNoteIntoEditor(note);
    el.titleInput.focus();
    closeSidebarOnMobile();
  }

  function getActiveNote() {
    return notes.find((n) => n.id === activeNoteId) || null;
  }

  /** Update the active note's fields and bump its updatedAt timestamp. */
  function updateActiveNote(fields) {
    const note = getActiveNote();
    if (!note) return;
    Object.assign(note, fields, { updatedAt: Date.now() });
    persistNotes();
  }

  function deleteNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    const label = note.title || "this note";
    const confirmed = window.confirm(`Delete "${label}"? This can't be undone.`);
    if (!confirmed) return;

    notes = notes.filter((n) => n.id !== id);
    persistNotes();

    if (activeNoteId === id) {
      activeNoteId = notes.length ? notes[0].id : null;
    }

    renderNoteList();
    if (activeNoteId) {
      loadNoteIntoEditor(getActiveNote());
    } else {
      showEmptyEditorState();
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /** Rebuild the sidebar list of notes, sorted by most recently updated. */
  function renderNoteList() {
    el.noteList.innerHTML = "";

    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    el.sidebarEmpty.hidden = sorted.length > 0;

    sorted.forEach((note) => {
      const li = document.createElement("li");
      li.className = "note-item" + (note.id === activeNoteId ? " is-active" : "");
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");

      const titleEl = document.createElement("div");
      titleEl.className = "note-item__title";
      titleEl.textContent = note.title || "Untitled note";

      const metaEl = document.createElement("div");
      metaEl.className = "note-item__meta";
      metaEl.textContent = relativeTime(note.updatedAt);

      li.appendChild(titleEl);
      li.appendChild(metaEl);

      const select = () => selectNote(note.id);
      li.addEventListener("click", select);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });

      el.noteList.appendChild(li);
    });
  }

  function selectNote(id) {
    if (id === activeNoteId) return;
    activeNoteId = id;
    renderNoteList();
    loadNoteIntoEditor(getActiveNote());
    closeSidebarOnMobile();
  }

  /** Populate the editor + preview with a given note's content. */
  function loadNoteIntoEditor(note) {
    el.titleInput.value = note.title;
    el.markdownInput.value = note.content;
    el.markdownInput.disabled = false;
    el.titleInput.disabled = false;
    el.deleteNoteBtn.disabled = false;
    renderPreview(note.content);
    updateStatusBar(note);
    setSaveIndicator("Saved");
  }

  /** Shown when there are no notes at all — an empty state that invites action. */
  function showEmptyEditorState() {
    el.titleInput.value = "";
    el.titleInput.disabled = true;
    el.markdownInput.value = "";
    el.markdownInput.disabled = true;
    el.markdownInput.placeholder = "Create a note to start writing.";
    el.deleteNoteBtn.disabled = true;
    el.markdownPreview.innerHTML = "";
    el.wordCount.textContent = "0 words";
    el.charCount.textContent = "0 characters";
    el.updatedAt.textContent = "—";
    setSaveIndicator("Saved");
  }

  /** Convert markdown to sanitized HTML and inject it into the preview pane. */
  function renderPreview(markdownText) {
    const rawHtml = marked.parse(markdownText || "");
    const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
    el.markdownPreview.innerHTML = safeHtml;
  }

  function updateStatusBar(note) {
    const text = note.content || "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    el.wordCount.textContent = `${words} word${words === 1 ? "" : "s"}`;
    el.charCount.textContent = `${text.length} character${text.length === 1 ? "" : "s"}`;
    el.updatedAt.textContent = `Updated ${relativeTime(note.updatedAt)}`;
  }

  function setSaveIndicator(state) {
    if (state === "saving") {
      el.saveIndicator.textContent = "Saving…";
      el.saveIndicator.classList.add("is-saving");
    } else {
      el.saveIndicator.textContent = "Saved";
      el.saveIndicator.classList.remove("is-saving");
    }
  }

  /** Small helper for human-friendly relative timestamps in the sidebar. */
  function relativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  // ============================================================================
  // AUTO-SAVE (debounced)
  // ============================================================================

  /** Schedule a save shortly after the user stops typing, rather than on every keystroke. */
  function scheduleAutosave(fields) {
    setSaveIndicator("saving");
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      updateActiveNote(fields);
      renderNoteList();               // reflect new title / recency ordering
      updateStatusBar(getActiveNote());
      setSaveIndicator("saved");
    }, AUTOSAVE_DELAY_MS);
  }

  // ============================================================================
  // EVENT WIRING
  // ============================================================================

  el.newNoteBtn.addEventListener("click", createNote);

  el.deleteNoteBtn.addEventListener("click", () => {
    if (activeNoteId) deleteNote(activeNoteId);
  });

  el.titleInput.addEventListener("input", () => {
    scheduleAutosave({ title: el.titleInput.value });
  });

  el.markdownInput.addEventListener("input", () => {
    renderPreview(el.markdownInput.value); // preview updates instantly
    scheduleAutosave({ content: el.markdownInput.value });
  });

  // Mobile sidebar toggle
  el.menuToggle.addEventListener("click", () => {
    const isOpen = el.sidebar.classList.toggle("is-open");
    el.menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) {
      el.sidebar.classList.remove("is-open");
      el.menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  // ============================================================================
  // INIT
  // ============================================================================

  function init() {
    notes = loadNotes();

    if (notes.length) {
      activeNoteId = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
      renderNoteList();
      loadNoteIntoEditor(getActiveNote());
    } else {
      renderNoteList();
      showEmptyEditorState();
    }
  }

  init();
})();
