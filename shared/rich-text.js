// Shared rich-text engine: a selection toolbar for contenteditable surfaces,
// plus the sanitizer that decides what survives a save.
//
// Consumers supply their own palette so colours stay on-brand per surface:
//   RichText.attach(el, { palette: [{ name, value }], commands: [...], onChange });
//   RichText.sanitize(html, { allowColor: true });

(function (global) {
    'use strict';

    const HEX_PATTERN  = /^#[0-9a-f]{6}$/;
    const SAFE_HREF    = /^(https?:|mailto:|#)/i;
    const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON']);
    const DEFAULT_TAGS = ['P', 'BR', 'H2', 'H3', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'HR', 'MARK'];

    let colorProbe  = null;
    let colorCanvas = null;

    // Canvas resolves keywords, hsl() and rgb() to #rrggbb. Painting the same value
    // over two different starting colours detects rejection: an invalid value leaves
    // whatever was there, so the two reads disagree.
    function toHex(cssColor) {
        if (!colorCanvas) colorCanvas = document.createElement('canvas').getContext('2d');
        colorCanvas.fillStyle = '#000000';
        colorCanvas.fillStyle = cssColor;
        const first = colorCanvas.fillStyle;
        colorCanvas.fillStyle = '#ffffff';
        colorCanvas.fillStyle = cssColor;
        if (first !== colorCanvas.fillStyle) return null;
        return HEX_PATTERN.test(first) ? first : null;
    }

    // The CSSOM setter is the validator. It accepts a bare <color> and silently
    // rejects everything else, so no extra declaration can ride in on a style
    // attribute the way it could if we pattern-matched the raw string.
    function normalizeColor(value) {
        if (!value) return null;
        if (!colorProbe) colorProbe = document.createElement('span');
        colorProbe.style.color = '';
        colorProbe.style.color = value;
        if (!colorProbe.style.color) return null;
        return toHex(colorProbe.style.color);
    }

    function sanitize(html, options) {
        const settings   = options || {};
        const allowColor = !!settings.allowColor;
        const allowed    = new Set(DEFAULT_TAGS.concat(settings.extraTags || []));
        if (allowColor) allowed.add('SPAN');

        const holder = document.createElement('template');
        holder.innerHTML = html || '';

        function clean(parent) {
            Array.from(parent.children).forEach(element => {
                if (BLOCKED_TAGS.has(element.tagName)) {
                    element.remove();
                    return;
                }
                if (!allowed.has(element.tagName)) {
                    clean(element);
                    element.replaceWith(...element.childNodes);
                    return;
                }

                const href  = element.tagName === 'A' ? element.getAttribute('href') || '' : '';
                const color = allowColor ? normalizeColor(element.style.color) : null;

                Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));

                if (element.tagName === 'A' && SAFE_HREF.test(href)) {
                    element.setAttribute('href', href);
                    element.setAttribute('rel', 'noopener noreferrer');
                }
                if (color) element.style.color = color;

                clean(element);

                // A span carrying nothing is editor debris, not authored markup.
                if (element.tagName === 'SPAN' && !color) element.replaceWith(...element.childNodes);
            });
        }

        clean(holder.content);
        return holder.innerHTML.trim();
    }

    const state = {
        toolbar: null,
        colorRow: null,
        customInput: null,
        activeEditor: null,
        savedRange: null,
        buttons: []
    };

    let initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;
        // Without this some browsers still emit deprecated <font> tags, which the
        // sanitizer unwraps — the colour would vanish on save.
        try { document.execCommand('styleWithCSS', false, true); } catch (err) {}
    }

    function iconButton(icon, label, onActivate) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rt-btn';
        button.setAttribute('aria-label', label);
        button.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
        // mousedown, not click: the default action blurs the editor and collapses
        // the selection before any handler could act on it.
        button.addEventListener('mousedown', event => {
            event.preventDefault();
            onActivate();
        });
        return button;
    }

    function buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'rt-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Text formatting');
        toolbar.hidden = true;

        const commandRow = document.createElement('div');
        commandRow.className = 'rt-row';

        const definitions = [
            { key: 'bold',   icon: 'fa-solid fa-bold',      label: 'Bold',   run: () => runCommand('bold') },
            { key: 'italic', icon: 'fa-solid fa-italic',    label: 'Italic', run: () => runCommand('italic') },
            { key: 'link',   icon: 'fa-solid fa-link',      label: 'Add link', run: applyLink },
            { key: 'clear',  icon: 'fa-solid fa-eraser',    label: 'Clear formatting', run: () => runCommand('removeFormat') }
        ];

        definitions.forEach(definition => {
            const button = iconButton(definition.icon, definition.label, definition.run);
            button.dataset.command = definition.key;
            state.buttons.push(button);
            commandRow.appendChild(button);
        });

        const colorRow = document.createElement('div');
        colorRow.className = 'rt-row rt-colors';

        const customWrap = document.createElement('label');
        customWrap.className = 'rt-custom';
        customWrap.setAttribute('aria-label', 'Custom text colour');
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.className = 'rt-custom-input';
        customInput.value = '#d56a31';
        customInput.addEventListener('input', () => {
            restoreSelection();
            applyColor(customInput.value);
        });
        customWrap.appendChild(customInput);

        toolbar.appendChild(commandRow);
        toolbar.appendChild(colorRow);

        state.toolbar     = toolbar;
        state.colorRow    = colorRow;
        state.customInput = customInput;
        state.customWrap  = customWrap;

        document.body.appendChild(toolbar);
        return toolbar;
    }

    function renderPalette(palette) {
        const colorRow = state.colorRow;
        colorRow.innerHTML = '';
        (palette || []).forEach(swatch => {
            const hex = normalizeColor(swatch.value);
            if (!hex) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rt-swatch';
            button.style.background = hex;
            button.setAttribute('aria-label', swatch.name || hex);
            button.addEventListener('mousedown', event => {
                event.preventDefault();
                applyColor(hex);
            });
            colorRow.appendChild(button);
        });
        colorRow.appendChild(state.customWrap);
    }

    function runCommand(command) {
        try { document.execCommand(command, false, null); } catch (err) {}
        syncButtonStates();
        notifyChange();
    }

    function applyColor(value) {
        const hex = normalizeColor(value);
        if (!hex) return;
        try { document.execCommand('foreColor', false, hex); } catch (err) {}
        notifyChange();
    }

    function applyLink() {
        const url = window.prompt('Link URL');
        if (!url) return;
        if (!SAFE_HREF.test(url.trim())) {
            window.alert('Links must start with http:, https:, mailto: or #');
            return;
        }
        try { document.execCommand('createLink', false, url.trim()); } catch (err) {}
        notifyChange();
    }

    function notifyChange() {
        const config = state.activeEditor && state.activeEditor._richTextConfig;
        if (config && typeof config.onChange === 'function') config.onChange();
    }

    function syncButtonStates() {
        state.buttons.forEach(button => {
            const command = button.dataset.command;
            if (command !== 'bold' && command !== 'italic') return;
            let active = false;
            try { active = document.queryCommandState(command); } catch (err) {}
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('is-active', active);
        });
    }

    function hideToolbar() {
        if (state.toolbar) state.toolbar.hidden = true;
    }

    function restoreSelection() {
        if (!state.savedRange) return;
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.savedRange);
    }

    function editorForNode(node) {
        const element = node && node.nodeType === 1 ? node : node && node.parentElement;
        return element ? element.closest('[data-rich-text="on"]') : null;
    }

    function positionToolbar(rect) {
        const toolbar = state.toolbar;
        toolbar.hidden = false;
        const bounds = toolbar.getBoundingClientRect();
        const margin = 10;
        let left = rect.left + (rect.width / 2) - (bounds.width / 2);
        left = Math.max(margin, Math.min(left, window.innerWidth - bounds.width - margin));
        let top = rect.top - bounds.height - margin;
        if (top < margin) top = rect.bottom + margin;
        toolbar.style.left = `${Math.round(left)}px`;
        toolbar.style.top  = `${Math.round(top)}px`;
    }

    function handleSelectionChange() {
        if (!state.toolbar) return;
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) {
            hideToolbar();
            return;
        }

        const range  = selection.getRangeAt(0);
        const editor = editorForNode(range.commonAncestorContainer);
        if (!editor) {
            hideToolbar();
            return;
        }

        if (editor !== state.activeEditor) {
            state.activeEditor = editor;
            renderPalette(editor._richTextConfig && editor._richTextConfig.palette);
        }

        state.savedRange = range.cloneRange();
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) {
            hideToolbar();
            return;
        }
        positionToolbar(rect);
        syncButtonStates();
    }

    function attach(element, config) {
        if (!element) return;
        init();
        if (!state.toolbar) buildToolbar();

        element.setAttribute('data-rich-text', 'on');
        element._richTextConfig = config || {};

        if (!attach._bound) {
            attach._bound = true;
            document.addEventListener('selectionchange', handleSelectionChange);
            window.addEventListener('scroll', hideToolbar, true);
            window.addEventListener('resize', hideToolbar);
            document.addEventListener('mousedown', event => {
                if (state.toolbar && !state.toolbar.contains(event.target) && !editorForNode(event.target)) {
                    hideToolbar();
                }
            });
        }
    }

    function detach(element) {
        if (!element) return;
        element.removeAttribute('data-rich-text');
        delete element._richTextConfig;
        if (state.activeEditor === element) {
            state.activeEditor = null;
            hideToolbar();
        }
    }

    global.RichText = { sanitize, normalizeColor, attach, detach, hide: hideToolbar };
})(window);
