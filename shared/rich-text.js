// Shared rich-text engine: a selection toolbar for contenteditable surfaces,
// plus the sanitizer that decides what survives a save.
//
// Consumers supply their own command set and palette so each surface keeps its
// own character:
//   RichText.attach(el, { commands: [['bold','italic'], [custom]], palette, onChange });
//   RichText.sanitize(html, { allowColor: true, allowImages: true, embeds: ['youtube'] });

(function (global) {
    'use strict';

    const HEX_PATTERN  = /^#[0-9a-f]{6}$/;
    const SAFE_HREF    = /^(https?:|mailto:|#)/i;
    const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON']);
    const DEFAULT_TAGS = ['P', 'BR', 'H2', 'H3', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL',
                          'UL', 'OL', 'LI', 'A', 'HR', 'MARK'];
    const MEDIA_TAGS   = ['FIGURE', 'FIGCAPTION', 'IMG'];
    const ALIGNABLE    = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'FIGCAPTION']);
    const BLOCK_TAGS   = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'FIGCAPTION']);
    const EMBED_ID     = /^[A-Za-z0-9_-]{1,64}$/;
    const IMAGE_HOSTS  = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

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

    // Body images live in Firebase Storage. Anything pointing elsewhere is either
    // paste debris or a tracking pixel, so it does not survive the save.
    function normalizeImageSrc(value, hosts) {
        if (!value) return null;
        let url;
        try { url = new URL(value, global.location.href); } catch (err) { return null; }
        if (url.protocol !== 'https:') return null;
        return hosts.indexOf(url.hostname) === -1 ? null : url.href;
    }

    function readEmbed(element, providers) {
        if (!providers.length) return null;
        const provider = element.getAttribute('data-embed');
        const id       = element.getAttribute('data-embed-id');
        if (!provider || providers.indexOf(provider) === -1) return null;
        return EMBED_ID.test(id || '') ? { provider: provider, id: id } : null;
    }

    function sanitize(html, options) {
        const settings   = options || {};
        const allowColor = !!settings.allowColor;
        const allowAlign = !!settings.allowAlign;
        const allowImage = !!settings.allowImages;
        const embeds     = settings.embeds || [];
        const hosts      = settings.imageHosts || IMAGE_HOSTS;

        const allowed = new Set(DEFAULT_TAGS.concat(settings.extraTags || []));
        if (allowColor) allowed.add('SPAN');
        if (allowImage) MEDIA_TAGS.forEach(tag => allowed.add(tag));
        if (embeds.length) allowed.add('FIGURE');

        const holder = document.createElement('template');
        holder.innerHTML = html || '';

        function clean(parent) {
            Array.from(parent.children).forEach(element => {
                const tag = element.tagName;

                if (BLOCKED_TAGS.has(tag)) {
                    element.remove();
                    return;
                }
                if (!allowed.has(tag)) {
                    clean(element);
                    element.replaceWith(...element.childNodes);
                    return;
                }

                const href     = tag === 'A' ? element.getAttribute('href') || '' : '';
                const color    = allowColor ? normalizeColor(element.style.color) : null;
                const centered = allowAlign && ALIGNABLE.has(tag) && element.style.textAlign === 'center';
                const embed    = tag === 'FIGURE' ? readEmbed(element, embeds) : null;
                const src      = tag === 'IMG' ? normalizeImageSrc(element.getAttribute('src'), hosts) : null;
                const alt      = tag === 'IMG' ? (element.getAttribute('alt') || '') : '';

                Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));

                if (tag === 'IMG') {
                    if (!src) {
                        element.remove();
                        return;
                    }
                    element.setAttribute('src', src);
                    element.setAttribute('alt', alt);
                    element.setAttribute('loading', 'lazy');
                    element.setAttribute('decoding', 'async');
                    return;
                }

                // Only the provider and the id are ever stored. The player is rebuilt
                // from those two values at render time, so no third-party frame — and
                // nothing that could carry script — is ever persisted in an entry.
                if (embed) {
                    element.setAttribute('data-embed', embed.provider);
                    element.setAttribute('data-embed-id', embed.id);
                    element.replaceChildren();
                    return;
                }

                if (tag === 'A' && SAFE_HREF.test(href)) {
                    element.setAttribute('href', href);
                    element.setAttribute('rel', 'noopener noreferrer');
                }
                if (color)    element.style.color = color;
                if (centered) element.style.textAlign = 'center';

                clean(element);

                // A span carrying nothing is editor debris, not authored markup.
                if (tag === 'SPAN' && !color) element.replaceWith(...element.childNodes);
                if (tag === 'FIGCAPTION' && !(element.textContent || '').trim()) element.remove();
                if (tag === 'FIGURE' && !element.querySelector('img')) element.remove();
            });
        }

        clean(holder.content);
        return holder.innerHTML.trim();
    }

    const state = {
        toolbar: null,
        commandHost: null,
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

    function editorForNode(node) {
        const element = node && node.nodeType === 1 ? node : node && node.parentElement;
        return element ? element.closest('[data-rich-text="on"]') : null;
    }

    function currentBlock() {
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount) return null;
        const node   = selection.getRangeAt(0).startContainer;
        const editor = editorForNode(node);
        if (!editor) return null;
        let element = node.nodeType === 1 ? node : node.parentElement;
        while (element && element !== editor) {
            if (BLOCK_TAGS.has(element.tagName)) return element;
            element = element.parentElement;
        }
        return null;
    }

    function markAncestor() {
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount) return null;
        const node    = selection.getRangeAt(0).commonAncestorContainer;
        const element = node.nodeType === 1 ? node : node.parentElement;
        const mark    = element ? element.closest('mark') : null;
        return mark && editorForNode(mark) ? mark : null;
    }

    function queryState(command) {
        try { return document.queryCommandState(command); } catch (err) { return false; }
    }

    function blockIs(tag) {
        const block = currentBlock();
        return !!block && block.tagName === tag;
    }

    function isCentered() {
        const block = currentBlock();
        return !!block && block.style.textAlign === 'center';
    }

    function notifyChange() {
        const config = state.activeEditor && state.activeEditor._richTextConfig;
        if (config && typeof config.onChange === 'function') config.onChange();
    }

    function runCommand(command) {
        try { document.execCommand(command, false, null); } catch (err) {}
        syncButtonStates();
        notifyChange();
    }

    function toggleBlock(tag) {
        const target = blockIs(tag) ? 'p' : tag.toLowerCase();
        try { document.execCommand('formatBlock', false, '<' + target + '>'); } catch (err) {}
        syncButtonStates();
        notifyChange();
    }

    function toggleCenter() {
        const centered = isCentered();
        try { document.execCommand(centered ? 'justifyLeft' : 'justifyCenter', false, null); } catch (err) {}
        // justifyLeft writes an explicit left alignment; the templates already read
        // left as their default, so drop the declaration instead of storing it.
        const block = currentBlock();
        if (block && centered) block.style.removeProperty('text-align');
        syncButtonStates();
        notifyChange();
    }

    function toggleHighlight() {
        const existing = markAncestor();
        if (existing) {
            existing.replaceWith(...existing.childNodes);
            syncButtonStates();
            notifyChange();
            return;
        }
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const mark  = document.createElement('mark');
        try {
            range.surroundContents(mark);
        } catch (err) {
            // surroundContents refuses a selection that straddles element boundaries.
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
        }
        selection.removeAllRanges();
        const after = document.createRange();
        after.selectNodeContents(mark);
        selection.addRange(after);
        syncButtonStates();
        notifyChange();
    }

    function insertDivider() {
        try { document.execCommand('insertHorizontalRule', false, null); } catch (err) {}
        notifyChange();
    }

    function clearFormatting() {
        try { document.execCommand('removeFormat', false, null); } catch (err) {}
        const mark = markAncestor();
        if (mark) mark.replaceWith(...mark.childNodes);
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

    const COMMANDS = {
        bold:        { icon: 'fa-solid fa-bold',          label: 'Bold',              run: () => runCommand('bold'),          state: () => queryState('bold') },
        italic:      { icon: 'fa-solid fa-italic',        label: 'Italic',            run: () => runCommand('italic'),        state: () => queryState('italic') },
        underline:   { icon: 'fa-solid fa-underline',     label: 'Underline',         run: () => runCommand('underline'),     state: () => queryState('underline') },
        strike:      { icon: 'fa-solid fa-strikethrough', label: 'Strikethrough',     run: () => runCommand('strikeThrough'), state: () => queryState('strikeThrough') },
        highlight:   { icon: 'fa-solid fa-highlighter',   label: 'Highlight',         run: toggleHighlight,                   state: () => !!markAncestor() },
        link:        { icon: 'fa-solid fa-link',          label: 'Add link',          run: applyLink },
        clear:       { icon: 'fa-solid fa-eraser',        label: 'Clear formatting',  run: clearFormatting },
        hr:          { icon: 'fa-solid fa-grip-lines',    label: 'Section divider',   run: insertDivider },
        alignCenter: { icon: 'fa-solid fa-align-center',  label: 'Centre',            run: toggleCenter,                      state: isCentered },
        h2:          { text: 'H1', label: 'Section heading', run: () => toggleBlock('H2'), state: () => blockIs('H2') },
        h3:          { text: 'H2', label: 'Sub heading',     run: () => toggleBlock('H3'), state: () => blockIs('H3') },
        quote:       { icon: 'fa-solid fa-quote-left', label: 'Quote', run: () => toggleBlock('BLOCKQUOTE'), state: () => blockIs('BLOCKQUOTE') }
    };

    const DEFAULT_COMMANDS = ['bold', 'italic', 'link', 'clear'];

    function makeButton(definition) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rt-btn' + (definition.text ? ' rt-btn-text' : '');
        button.setAttribute('aria-label', definition.label);
        if (typeof definition.state === 'function') button.setAttribute('aria-pressed', 'false');
        button.innerHTML = definition.text
            ? `<span aria-hidden="true">${definition.text}</span>`
            : `<i class="${definition.icon}" aria-hidden="true"></i>`;
        // mousedown, not click: the default action blurs the editor and collapses
        // the selection before any handler could act on it.
        button.addEventListener('mousedown', event => {
            event.preventDefault();
            definition.run();
        });
        return button;
    }

    function buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'rt-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Text formatting');
        toolbar.hidden = true;

        const commandHost = document.createElement('div');
        commandHost.className = 'rt-commands';

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

        toolbar.appendChild(commandHost);
        toolbar.appendChild(colorRow);

        state.toolbar     = toolbar;
        state.commandHost = commandHost;
        state.colorRow    = colorRow;
        state.customInput = customInput;
        state.customWrap  = customWrap;

        document.body.appendChild(toolbar);
        return toolbar;
    }

    // A flat list is one row; an array of arrays is one row per group.
    function normalizeGroups(commands) {
        if (!commands || !commands.length) return [DEFAULT_COMMANDS];
        return Array.isArray(commands[0]) ? commands : [commands];
    }

    function renderCommands(commands) {
        const host = state.commandHost;
        host.innerHTML = '';
        state.buttons = [];

        normalizeGroups(commands).forEach(group => {
            const row = document.createElement('div');
            row.className = 'rt-row';
            (group || []).forEach(entry => {
                const definition = typeof entry === 'string' ? COMMANDS[entry] : entry;
                if (!definition || typeof definition.run !== 'function') return;
                const button = makeButton(definition);
                state.buttons.push({ button: button, definition: definition });
                row.appendChild(button);
            });
            if (row.children.length) host.appendChild(row);
        });
    }

    function renderPalette(palette) {
        const colorRow = state.colorRow;
        colorRow.innerHTML = '';
        const swatches = palette || [];
        colorRow.hidden = !swatches.length;
        if (!swatches.length) return;

        swatches.forEach(swatch => {
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

    function syncButtonStates() {
        state.buttons.forEach(entry => {
            if (typeof entry.definition.state !== 'function') return;
            let active = false;
            try { active = !!entry.definition.state(); } catch (err) {}
            entry.button.setAttribute('aria-pressed', String(active));
            entry.button.classList.toggle('is-active', active);
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
            const config = editor._richTextConfig || {};
            renderCommands(config.commands);
            renderPalette(config.palette);
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

    global.RichText = {
        sanitize: sanitize,
        normalizeColor: normalizeColor,
        normalizeImageSrc: normalizeImageSrc,
        attach: attach,
        detach: detach,
        hide: hideToolbar,
        imageHosts: IMAGE_HOSTS
    };
})(window);
