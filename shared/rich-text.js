// Shared rich-text engine: the two writing affordances for contenteditable
// surfaces, plus the sanitizer that decides what survives a save.
//
// A selection toolbar appears over selected text and carries the commands that
// change what is already written. A "+" follows the caret onto empty blocks and
// opens the menu of things that can be added. The split is by question asked, not
// by convenience: nothing appears until the author is in a position to want it.
//
// Consumers supply their own command set and palette so each surface keeps its
// own character:
//   RichText.attach(el, { commands: [['bold','italic'], [custom]], inserts, palette, onChange });
//   RichText.sanitize(html, { allowColor: true, allowImages: true, embeds: ['youtube'] });
//
// Every command mutates the DOM directly. document.execCommand is deprecated,
// produces markup that varies by browser, and cannot be extended — so the only
// remaining uses are the two one-shot mode switches in init(). Because the engine
// owns its mutations, it also owns undo: the browser's native history no longer
// tracks them, so RichText keeps its own.

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
    const INLINE_TAGS  = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'MARK', 'A', 'SPAN']);
    const EMBED_ID     = /^[A-Za-z0-9_-]{1,64}$/;
    const ROOT_BLOCKS  = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'FIGURE']);
    const IMAGE_HOSTS  = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];
    const ZERO_WIDTH   = '\u200b';

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
                // The placeholder break an empty block needs is debris once it has text.
                if (BLOCK_TAGS.has(tag) && (element.textContent || '').trim()) {
                    const last = element.lastChild;
                    if (last && last.nodeName === 'BR') last.remove();
                }
                if (tag === 'FIGCAPTION' && !(element.textContent || '').trim()) element.remove();
                if (tag === 'FIGURE' && !element.querySelector('img')) element.remove();
            });
        }

        // The caret anchor for a mark applied with nothing selected is scaffolding,
        // not writing, so it never reaches storage.
        function stripAnchors(root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const found = [];
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.indexOf(ZERO_WIDTH) !== -1) found.push(node);
            }
            found.forEach(text => {
                text.nodeValue = text.nodeValue.split(ZERO_WIDTH).join('');
                if (!text.nodeValue) text.remove();
            });
        }

        clean(holder.content);
        stripAnchors(holder.content);
        if (settings.wrapLoose) wrapLooseText(holder.content);
        return holder.innerHTML.trim();
    }

    // Consecutive loose nodes join one paragraph, so an unwrapped line keeps its
    // inline formatting instead of being split into a paragraph per fragment.
    function wrapLooseText(root) {
        let paragraph = null;
        Array.from(root.childNodes).forEach(node => {
            if (node.nodeType === 1 && ROOT_BLOCKS.has(node.tagName)) {
                paragraph = null;
                return;
            }
            if (node.nodeType === 3 && !node.textContent.trim()) return;
            if (!paragraph) {
                paragraph = document.createElement('p');
                node.before(paragraph);
            }
            paragraph.appendChild(node);
        });
    }

    // ── SELECTION ──────────────────────────────────────────────────────────────
    // Selections are saved as plain text offsets into the editor. Formatting
    // rearranges elements but never the characters, so an offset survives a change
    // that a node reference would not.

    function editorForNode(node) {
        const element = node && node.nodeType === 1 ? node : node && node.parentElement;
        return element ? element.closest('[data-rich-text="on"]') : null;
    }

    function currentRange() {
        const selection = document.getSelection();
        return selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    }

    function offsetOf(editor, node, offset) {
        let target = node;
        let index  = offset;
        if (target.nodeType === 1) {
            const child = target.childNodes[index];
            if (child) {
                target = child;
                index = 0;
            } else {
                const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
                let total = 0;
                let text;
                while ((text = walker.nextNode())) total += text.length;
                return offsetOf(editor, target.parentNode || editor,
                    Array.prototype.indexOf.call((target.parentNode || editor).childNodes, target)) + total;
            }
        }
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let total = 0;
        let text;
        while ((text = walker.nextNode())) {
            if (text === target) return total + index;
            total += text.length;
        }
        return total;
    }

    function locate(editor, target) {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let total = 0;
        let text;
        let last = null;
        while ((text = walker.nextNode())) {
            if (total + text.length >= target) return { node: text, offset: target - total };
            total += text.length;
            last = text;
        }
        return last ? { node: last, offset: last.length } : { node: editor, offset: 0 };
    }

    function saveSelection(editor) {
        const range = currentRange();
        if (!range || !editor.contains(range.commonAncestorContainer)) return null;
        return {
            start: offsetOf(editor, range.startContainer, range.startOffset),
            end:   offsetOf(editor, range.endContainer, range.endOffset)
        };
    }

    function restoreSelectionOffsets(editor, saved) {
        if (!saved) return;
        const from = locate(editor, saved.start);
        const to   = locate(editor, saved.end);
        const range = document.createRange();
        try {
            range.setStart(from.node, Math.min(from.offset, from.node.length || 0));
            range.setEnd(to.node, Math.min(to.offset, to.node.length || 0));
        } catch (err) {
            return;
        }
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function leafBlocks(editor) {
        return Array.from(editor.querySelectorAll('p, h2, h3, blockquote, li, figcaption'));
    }

    function blockFor(editor, node) {
        let element = node && node.nodeType === 1 ? node : node && node.parentElement;
        while (element && element !== editor) {
            if (BLOCK_TAGS.has(element.tagName)) return element;
            element = element.parentElement;
        }
        return null;
    }

    function ancestorTag(node, tag, editor) {
        let element = node && node.nodeType === 1 ? node : node && node.parentElement;
        while (element && element !== editor) {
            if (element.tagName === tag) return element;
            element = element.parentElement;
        }
        return null;
    }

    function textNodesIn(range) {
        const root = range.commonAncestorContainer;
        const scope = root.nodeType === 1 ? root : root.parentNode;
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.length) continue;
            if (range.intersectsNode(node)) nodes.push(node);
        }
        return nodes.filter(node => {
            if (node === range.startContainer && range.startOffset >= node.length) return false;
            if (node === range.endContainer && range.endOffset <= 0) return false;
            return true;
        });
    }

    // A range that spans two paragraphs must be applied inside each one: extracting
    // across the boundary would pull the blocks themselves into the wrapper.
    function segmentsOf(editor, range) {
        const blocks = leafBlocks(editor).filter(block => range.intersectsNode(block));
        if (!blocks.length) return [range.cloneRange()];
        const segments = [];
        blocks.forEach(block => {
            const scope = document.createRange();
            scope.selectNodeContents(block);
            const sub = range.cloneRange();
            if (sub.compareBoundaryPoints(Range.START_TO_START, scope) < 0) {
                sub.setStart(scope.startContainer, scope.startOffset);
            }
            if (sub.compareBoundaryPoints(Range.END_TO_END, scope) > 0) {
                sub.setEnd(scope.endContainer, scope.endOffset);
            }
            if (!sub.collapsed) segments.push(sub);
        });
        return segments;
    }

    // extractContents splits any partially covered ancestor for us, so removing a
    // mark from the middle of one is the same operation as adding it.
    function transform(range, mutate) {
        const fragment = range.extractContents();
        mutate(fragment);
        range.insertNode(fragment);
    }

    // splitText updates live ranges for us, so the range still covers the same
    // characters afterwards — it just no longer starts or ends mid-node.
    function splitBoundaries(range) {
        const end = range.endContainer;
        if (end.nodeType === 3 && range.endOffset > 0 && range.endOffset < end.length) {
            end.splitText(range.endOffset);
        }
        const start = range.startContainer;
        if (start.nodeType === 3 && range.startOffset > 0 && range.startOffset < start.length) {
            start.splitText(range.startOffset);
        }
    }

    // Move everything before `node` out of `ancestor` and into a clone placed just
    // before it, walking up through any intermediate wrappers.
    function splitBefore(ancestor, node) {
        let current = node;
        while (current !== ancestor && current.parentNode) {
            const parent = current.parentNode;
            if (current.previousSibling) {
                const clone = parent.cloneNode(false);
                let sibling = parent.firstChild;
                while (sibling && sibling !== current) {
                    const next = sibling.nextSibling;
                    clone.appendChild(sibling);
                    sibling = next;
                }
                parent.before(clone);
            }
            current = parent;
        }
    }

    function splitAfter(ancestor, node) {
        let current = node;
        while (current !== ancestor && current.parentNode) {
            const parent = current.parentNode;
            if (current.nextSibling) {
                const clone = parent.cloneNode(false);
                let sibling = current.nextSibling;
                while (sibling) {
                    const next = sibling.nextSibling;
                    clone.appendChild(sibling);
                    sibling = next;
                }
                parent.after(clone);
            }
            current = parent;
        }
    }

    // extractContents only splits an ancestor when the range boundaries sit at
    // different depths — a selection inside one text node leaves the mark whole.
    // So the mark is split around the node explicitly, then unwrapped.
    function removeMarkAround(node, tag, editor) {
        let host = ancestorTag(node, tag, editor);
        let guard = 0;
        while (host && guard < 20) {
            splitBefore(host, node);
            splitAfter(host, node);
            host.replaceWith(...host.childNodes);
            host = ancestorTag(node, tag, editor);
            guard += 1;
        }
    }

    function unwrapAll(root, tag) {
        Array.from(root.querySelectorAll(tag)).forEach(element => {
            element.replaceWith(...element.childNodes);
        });
    }

    function sameShape(a, b) {
        return a.tagName === b.tagName &&
               a.getAttribute('style') === b.getAttribute('style') &&
               a.getAttribute('href') === b.getAttribute('href');
    }

    function tidy(root) {
        let child = root.firstChild;
        while (child) {
            const next = child.nextSibling;
            if (next && child.nodeType === 1 && next.nodeType === 1 &&
                INLINE_TAGS.has(child.tagName) && sameShape(child, next)) {
                while (next.firstChild) child.appendChild(next.firstChild);
                next.remove();
                continue;
            }
            if (child.nodeType === 1) tidy(child);
            child = child.nextSibling;
        }
        root.normalize();
    }

    // ── HISTORY ────────────────────────────────────────────────────────────────
    // The engine mutates the DOM itself, so the browser no longer has a coherent
    // undo stack for it. Snapshots are cheap for entries this size and cannot get
    // out of step with the document the way a replayed command log can.

    const histories = new WeakMap();

    function historyFor(editor) {
        let entry = histories.get(editor);
        if (!entry) {
            entry = { undo: [], redo: [], timer: null, pending: false };
            histories.set(editor, entry);
        }
        return entry;
    }

    function snapshot(editor) {
        return { html: editor.innerHTML, selection: saveSelection(editor) };
    }

    function pushHistory(editor, state) {
        const entry = historyFor(editor);
        if (entry.undo.length && entry.undo[entry.undo.length - 1].html === state.html) return;
        entry.undo.push(state);
        if (entry.undo.length > 120) entry.undo.shift();
        entry.redo.length = 0;
    }

    // Commands commit immediately; typing coalesces so one undo removes a burst of
    // characters rather than one character.
    function record(editor, immediate) {
        const entry = historyFor(editor);
        if (immediate) {
            clearTimeout(entry.timer);
            entry.pending = false;
            pushHistory(editor, snapshot(editor));
            return;
        }
        if (!entry.pending) {
            pushHistory(editor, snapshot(editor));
            entry.pending = true;
        }
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => { entry.pending = false; }, 600);
    }

    function applySnapshot(editor, state) {
        editor.innerHTML = state.html;
        editor.focus();
        restoreSelectionOffsets(editor, state.selection);
    }

    function undo(editor) {
        const target = editor || state.activeEditor;
        if (!target) return;
        const entry = historyFor(target);
        clearTimeout(entry.timer);
        entry.pending = false;
        const previous = entry.undo.pop();
        if (!previous) return;
        entry.redo.push(snapshot(target));
        applySnapshot(target, previous);
        notifyChange();
    }

    function redo(editor) {
        const target = editor || state.activeEditor;
        if (!target) return;
        const entry = historyFor(target);
        const next = entry.redo.pop();
        if (!next) return;
        entry.undo.push(snapshot(target));
        applySnapshot(target, next);
        notifyChange();
    }

    // ── COMMANDS ───────────────────────────────────────────────────────────────

    function activeEditor() {
        const range = currentRange();
        return range ? editorForNode(range.commonAncestorContainer) : state.activeEditor;
    }

    function markActive(tag) {
        const range = currentRange();
        if (!range) return false;
        const editor = editorForNode(range.commonAncestorContainer);
        if (!editor) return false;
        if (range.collapsed) return !!ancestorTag(range.startContainer, tag, editor);
        const nodes = textNodesIn(range);
        if (!nodes.length) return !!ancestorTag(range.startContainer, tag, editor);
        return nodes.every(node => !!ancestorTag(node, tag, editor));
    }

    // With nothing selected there is no text to wrap, so the mark is opened around
    // an invisible anchor and the caret is parked inside it. Typing continues in the
    // mark; the anchor is stripped on save.
    function openMarkAtCaret(editor, tag, decorate) {
        const range = currentRange();
        if (!range) return;
        const wrapper = document.createElement(tag);
        if (decorate) decorate(wrapper);
        wrapper.appendChild(document.createTextNode(ZERO_WIDTH));
        range.insertNode(wrapper);
        const selection = document.getSelection();
        const caret = document.createRange();
        caret.setStart(wrapper.firstChild, 1);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
    }

    function runInline(tag, mode, decorate) {
        const editor = activeEditor();
        if (!editor) return;
        const range = currentRange();
        if (!range) return;

        record(editor, true);

        if (range.collapsed) {
            if (mode === 'remove') {
                const host = ancestorTag(range.startContainer, tag, editor);
                if (host) {
                    const saved = saveSelection(editor);
                    host.replaceWith(...host.childNodes);
                    tidy(editor);
                    restoreSelectionOffsets(editor, saved);
                }
            } else {
                openMarkAtCaret(editor, tag, decorate);
            }
            syncButtonStates();
            notifyChange();
            return;
        }

        const saved = saveSelection(editor);
        if (mode === 'remove') {
            segmentsOf(editor, range).forEach(segment => {
                splitBoundaries(segment);
                textNodesIn(segment).forEach(node => removeMarkAround(node, tag, editor));
            });
        } else {
            segmentsOf(editor, range).forEach(segment => {
                transform(segment, fragment => {
                    unwrapAll(fragment, tag.toLowerCase());
                    const wrapper = document.createElement(tag);
                    if (decorate) decorate(wrapper);
                    while (fragment.firstChild) wrapper.appendChild(fragment.firstChild);
                    fragment.appendChild(wrapper);
                });
            });
        }
        tidy(editor);
        restoreSelectionOffsets(editor, saved);
        syncButtonStates();
        notifyChange();
    }

    function toggleInline(tag) {
        runInline(tag, markActive(tag) ? 'remove' : 'apply');
    }

    function applyColor(value) {
        const hex = normalizeColor(value);
        if (!hex) return;
        runInline('SPAN', 'apply', element => { element.style.color = hex; });
    }

    function applyLink() {
        const url = window.prompt('Link URL');
        if (!url) return;
        const href = url.trim();
        if (!SAFE_HREF.test(href)) {
            window.alert('Links must start with http:, https:, mailto: or #');
            return;
        }
        runInline('A', 'apply', element => {
            element.setAttribute('href', href);
            element.setAttribute('rel', 'noopener noreferrer');
        });
    }

    function clearFormatting() {
        const editor = activeEditor();
        const range = currentRange();
        if (!editor || !range || range.collapsed) return;
        record(editor, true);
        const saved = saveSelection(editor);
        segmentsOf(editor, range).forEach(segment => {
            splitBoundaries(segment);
            textNodesIn(segment).forEach(node => {
                INLINE_TAGS.forEach(tag => removeMarkAround(node, tag, editor));
            });
        });
        tidy(editor);
        restoreSelectionOffsets(editor, saved);
        syncButtonStates();
        notifyChange();
    }

    function blockIs(tag) {
        const range = currentRange();
        if (!range) return false;
        const editor = editorForNode(range.commonAncestorContainer);
        if (!editor) return false;
        const block = blockFor(editor, range.startContainer);
        return !!block && block.tagName === tag;
    }

    function setBlock(tag) {
        const editor = activeEditor();
        const range = currentRange();
        if (!editor || !range) return;

        record(editor, true);
        const saved = saveSelection(editor);
        const blocks = leafBlocks(editor).filter(block => range.intersectsNode(block));

        if (!blocks.length) {
            const wrapper = document.createElement(tag);
            while (editor.firstChild) wrapper.appendChild(editor.firstChild);
            editor.appendChild(wrapper);
        } else {
            blocks.forEach(block => {
                if (block.tagName === 'LI' || block.tagName === 'FIGCAPTION') return;
                if (block.tagName === tag) return;
                const replacement = document.createElement(tag);
                if (block.style.textAlign === 'center') replacement.style.textAlign = 'center';
                while (block.firstChild) replacement.appendChild(block.firstChild);
                block.replaceWith(replacement);
            });
        }
        restoreSelectionOffsets(editor, saved);
        syncButtonStates();
        notifyChange();
    }

    function toggleBlock(tag) {
        setBlock(blockIs(tag) ? 'P' : tag);
    }

    function isCentered() {
        const range = currentRange();
        if (!range) return false;
        const editor = editorForNode(range.commonAncestorContainer);
        if (!editor) return false;
        const block = blockFor(editor, range.startContainer);
        return !!block && block.style.textAlign === 'center';
    }

    function toggleCenter() {
        const editor = activeEditor();
        const range = currentRange();
        if (!editor || !range) return;
        record(editor, true);
        const centered = isCentered();
        leafBlocks(editor)
            .filter(block => range.intersectsNode(block))
            .forEach(block => {
                if (centered) block.style.removeProperty('text-align');
                else block.style.textAlign = 'center';
                if (!block.getAttribute('style')) block.removeAttribute('style');
            });
        syncButtonStates();
        notifyChange();
    }

    function insertBlockNode(editor, node) {
        const range = currentRange();
        const block = range ? blockFor(editor, range.startContainer) : null;
        if (block && editor.contains(block)) block.after(node);
        else editor.appendChild(node);

        let next = node.nextElementSibling;
        if (!next) {
            next = document.createElement('p');
            next.appendChild(document.createElement('br'));
            node.after(next);
        }
        const selection = document.getSelection();
        const caret = document.createRange();
        caret.selectNodeContents(next);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
    }

    function insertDivider() {
        const editor = activeEditor();
        if (!editor) return;
        record(editor, true);
        insertBlockNode(editor, document.createElement('hr'));
        notifyChange();
    }

    function insertHTML(html) {
        const editor = activeEditor();
        const range = currentRange();
        if (!editor || !range) return;
        record(editor, true);
        range.deleteContents();
        const holder = document.createElement('template');
        holder.innerHTML = html;
        const fragment = holder.content;
        const last = fragment.lastChild;
        range.insertNode(fragment);
        if (last) {
            const selection = document.getSelection();
            const caret = document.createRange();
            caret.setStartAfter(last);
            caret.collapse(true);
            selection.removeAllRanges();
            selection.addRange(caret);
        }
        tidy(editor);
        notifyChange();
    }

    const state = {
        toolbar: null,
        commandHost: null,
        colorRow: null,
        customInput: null,
        activeEditor: null,
        savedRange: null,
        buttons: [],
        insertButton: null,
        insertMenu: null,
        insertBlock: null,
        selecting: false
    };

    let initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;
        // These two switch how the browser's own editing behaviour writes markup —
        // they are modes, not commands, and have no modern replacement.
        try { document.execCommand('styleWithCSS', false, true); } catch (err) {}
        // Without this, Enter produces <div>, which the sanitizer unwraps — the
        // paragraph break would be lost on save.
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) {}
    }

    function notifyChange() {
        const config = state.activeEditor && state.activeEditor._richTextConfig;
        if (config && typeof config.onChange === 'function') config.onChange();
    }

    const COMMANDS = {
        bold:        { icon: 'fa-solid fa-bold',          label: 'Bold',             run: () => toggleInline('STRONG'), state: () => markActive('STRONG'), key: 'b' },
        italic:      { icon: 'fa-solid fa-italic',        label: 'Italic',           run: () => toggleInline('EM'),     state: () => markActive('EM'),     key: 'i' },
        underline:   { icon: 'fa-solid fa-underline',     label: 'Underline',        run: () => toggleInline('U'),      state: () => markActive('U'),      key: 'u' },
        strike:      { icon: 'fa-solid fa-strikethrough', label: 'Strikethrough',    run: () => toggleInline('S'),      state: () => markActive('S') },
        highlight:   { icon: 'fa-solid fa-highlighter',   label: 'Highlight',        run: () => toggleInline('MARK'),   state: () => markActive('MARK') },
        link:        { icon: 'fa-solid fa-link',          label: 'Add link',         run: applyLink,      key: 'k' },
        clear:       { icon: 'fa-solid fa-eraser',        label: 'Clear formatting', run: clearFormatting },
        hr:          { icon: 'fa-solid fa-grip-lines',    label: 'Section divider',  run: insertDivider },
        alignCenter: { icon: 'fa-solid fa-align-center',  label: 'Centre',           run: toggleCenter, state: isCentered },
        undo:        { icon: 'fa-solid fa-rotate-left',   label: 'Undo',             run: () => undo() },
        redo:        { icon: 'fa-solid fa-rotate-right',  label: 'Redo',             run: () => redo() },
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

    // The insert affordance: a "+" that follows the caret onto any empty block, and
    // the menu it opens. Separate from the toolbar because the two answer different
    // questions — the toolbar changes text that exists, this adds something new.
    function buildInsertUI() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rt-insert';
        button.hidden = true;
        button.setAttribute('aria-label', 'Insert');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';

        const menu = document.createElement('div');
        menu.className = 'rt-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Insert');

        // mousedown, not click: the default action blurs the editor and drops the
        // caret before the menu could act on it.
        button.addEventListener('mousedown', event => {
            event.preventDefault();
            if (menu.hidden) openInsertMenu();
            else closeInsertMenu();
        });

        state.insertButton = button;
        state.insertMenu   = menu;

        document.body.appendChild(button);
        document.body.appendChild(menu);
    }

    function makeMenuItem(definition) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'rt-menu-item';
        item.setAttribute('role', 'menuitem');
        const label = definition.menuLabel || definition.label;
        item.innerHTML = `<i class="${definition.icon}" aria-hidden="true"></i><span>${label}</span>`;
        item.addEventListener('mousedown', event => {
            event.preventDefault();
            closeInsertMenu();
            restoreSelection();
            definition.run();
            global.setTimeout(refresh, 0);
        });
        return item;
    }

    function renderInserts(inserts) {
        const menu = state.insertMenu;
        menu.innerHTML = '';
        (inserts || []).forEach(entry => {
            const definition = typeof entry === 'string' ? COMMANDS[entry] : entry;
            if (!definition || typeof definition.run !== 'function' || !definition.icon) return;
            menu.appendChild(makeMenuItem(definition));
        });
        state.insertsAvailable = !!menu.children.length;
    }

    function openInsertMenu() {
        if (!state.insertsAvailable) return;
        const menu   = state.insertMenu;
        const anchor = state.insertButton.getBoundingClientRect();
        menu.hidden = false;
        state.insertButton.setAttribute('aria-expanded', 'true');

        const bounds = menu.getBoundingClientRect();
        const margin = 8;
        let left = anchor.left;
        let top  = anchor.bottom + 6;
        if (left + bounds.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - bounds.width - margin);
        }
        if (top + bounds.height > window.innerHeight - margin) {
            top = Math.max(margin, anchor.top - bounds.height - 6);
        }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top  = `${Math.round(top)}px`;
    }

    function closeInsertMenu() {
        if (!state.insertMenu) return;
        state.insertMenu.hidden = true;
        if (state.insertButton) state.insertButton.setAttribute('aria-expanded', 'false');
    }

    function hideInsert() {
        closeInsertMenu();
        if (state.insertButton) state.insertButton.hidden = true;
        state.insertBlock = null;
    }

    // Only a block with nothing in it gets the affordance. A caption or a list item
    // is part of something the author already made, so inserting into it is wrong.
    function emptyBlockAt(editor, node) {
        const block = blockFor(editor, node);
        if (!block) return null;
        if (block.tagName === 'LI' || block.tagName === 'FIGCAPTION') return null;
        return (block.textContent || '').trim() ? null : block;
    }

    // One placement rule for every template: just left of the caret, which lands in
    // the gutter where a template has one and beside the caret where it does not.
    function positionInsertAt(block) {
        const button = state.insertButton;
        button.hidden = false;

        const rect   = block.getBoundingClientRect();
        const size   = button.getBoundingClientRect();
        const styles = global.getComputedStyle(block);
        const margin = 8;

        let line = parseFloat(styles.lineHeight);
        if (!line) line = (parseFloat(styles.fontSize) || 16) * 1.5;
        line = Math.min(line, rect.height || line);

        let left = rect.left - size.width - 10;
        if (left < margin) left = rect.left + 2;
        let top = rect.top + line / 2 - size.height / 2;

        left = Math.min(left, window.innerWidth - size.width - margin);
        top  = Math.min(Math.max(top, margin), window.innerHeight - size.height - margin);

        button.style.left = `${Math.round(left)}px`;
        button.style.top  = `${Math.round(top)}px`;
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

    function hideAll() {
        hideToolbar();
        hideInsert();
    }

    function restoreSelection() {
        if (!state.savedRange) return;
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.savedRange);
    }

    // A collapsed range in an empty block reports no rectangle of its own, so the
    // caller falls back to the block. For a real selection the first rect is the
    // first line, which is where the toolbar should sit.
    function rectFor(range) {
        const bounds = range.getBoundingClientRect();
        if (bounds.width || bounds.height) return bounds;
        const rects = range.getClientRects();
        return rects.length ? rects[0] : null;
    }

    // Above the selection, centred on it, flipped underneath when the selection is
    // near the top of the viewport.
    function positionToolbarOver(rect) {
        const toolbar = state.toolbar;
        toolbar.hidden = false;
        const bounds = toolbar.getBoundingClientRect();
        const margin = 8;

        let left = rect.left + rect.width / 2 - bounds.width / 2;
        let top  = rect.top - bounds.height - 10;
        if (top < margin) top = rect.bottom + 10;

        left = Math.min(Math.max(left, margin), window.innerWidth - bounds.width - margin);
        top  = Math.min(Math.max(top, margin), window.innerHeight - bounds.height - margin);

        toolbar.style.left = `${Math.round(left)}px`;
        toolbar.style.top  = `${Math.round(top)}px`;
    }

    function useEditor(editor) {
        if (editor === state.activeEditor) return;
        state.activeEditor = editor;
        const config = editor._richTextConfig || {};
        renderCommands(config.commands);
        renderPalette(config.palette);
        renderInserts(config.inserts);
    }

    // The two affordances are mutually exclusive by construction: one needs text
    // selected, the other needs an empty block, and a selection is never both.
    function refresh() {
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount) {
            hideAll();
            return;
        }

        const range  = selection.getRangeAt(0);
        const editor = editorForNode(range.commonAncestorContainer);
        if (!editor || editor !== document.activeElement) {
            hideAll();
            return;
        }

        useEditor(editor);
        state.savedRange = range.cloneRange();

        if (!range.collapsed) {
            hideInsert();
            const rect = rectFor(range);
            if (!rect) {
                hideToolbar();
                return;
            }
            positionToolbarOver(rect);
            syncButtonStates();
            return;
        }

        hideToolbar();
        const block = emptyBlockAt(editor, range.startContainer);
        if (!block) {
            hideInsert();
            return;
        }
        if (block !== state.insertBlock) closeInsertMenu();
        state.insertBlock = block;
        positionInsertAt(block);
    }

    // Mid-drag the selection changes on every mouse move; a toolbar that chased it
    // would be unreadable until the button came up. Keyboard selection has no such
    // phase, so it is not deferred.
    function handleSelectionChange() {
        if (state.selecting) {
            hideAll();
            return;
        }
        refresh();
    }

    // The browser's own shortcuts would call the editing commands this engine
    // replaced, so they are intercepted rather than left to fall through.
    function handleKeydown(event) {
        const editor = editorForNode(event.target);
        if (!editor) return;
        const accel = event.metaKey || event.ctrlKey;
        if (!accel) return;
        const key = (event.key || '').toLowerCase();

        if (key === 'z') {
            event.preventDefault();
            if (event.shiftKey) redo(editor);
            else undo(editor);
            return;
        }
        if (key === 'y') {
            event.preventDefault();
            redo(editor);
            return;
        }

        const match = Object.keys(COMMANDS)
            .map(name => COMMANDS[name])
            .find(definition => definition.key === key);
        if (!match) return;
        event.preventDefault();
        state.activeEditor = editor;
        match.run();
    }

    function attach(element, config) {
        if (!element) return;
        init();
        if (!state.toolbar) buildToolbar();
        if (!state.insertButton) buildInsertUI();

        element.setAttribute('data-rich-text', 'on');
        element._richTextConfig = config || {};
        historyFor(element);

        element.addEventListener('beforeinput', () => {
            hideAll();
            record(element, false);
        });
        element.addEventListener('keydown', handleKeydown);
        element.addEventListener('blur', () => {
            // A click on the toolbar blurs the editor before the command runs; the
            // panel must survive that, so only a blur away from it dismisses.
            global.setTimeout(() => {
                const focused = document.activeElement;
                if (state.toolbar && state.toolbar.contains(focused)) return;
                if (state.insertMenu && state.insertMenu.contains(focused)) return;
                if (focused === state.insertButton) return;
                if (editorForNode(focused)) return;
                hideAll();
            }, 0);
        });

        if (!attach._bound) {
            attach._bound = true;
            document.addEventListener('selectionchange', handleSelectionChange);
            window.addEventListener('scroll', hideAll, true);
            window.addEventListener('resize', hideAll);

            document.addEventListener('mousedown', event => {
                if (state.toolbar && state.toolbar.contains(event.target)) return;
                if (state.insertButton === event.target ||
                    (state.insertButton && state.insertButton.contains(event.target))) return;
                if (state.insertMenu && state.insertMenu.contains(event.target)) {
                    return;
                }
                closeInsertMenu();
                if (editorForNode(event.target)) state.selecting = true;
            });
            document.addEventListener('mouseup', () => {
                if (!state.selecting) return;
                state.selecting = false;
                refresh();
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') hideAll();
            });
        }
    }

    function detach(element) {
        if (!element) return;
        element.removeAttribute('data-rich-text');
        delete element._richTextConfig;
        if (state.activeEditor === element) {
            state.activeEditor = null;
            hideAll();
        }
    }

    global.RichText = {
        sanitize: sanitize,
        normalizeColor: normalizeColor,
        normalizeImageSrc: normalizeImageSrc,
        attach: attach,
        detach: detach,
        hide: hideAll,
        refresh: refresh,
        imageHosts: IMAGE_HOSTS,
        undo: undo,
        redo: redo,
        record: record,
        setBlock: setBlock,
        insertBlockNode: insertBlockNode,
        insertHTML: insertHTML,
        blockFor: blockFor,
        editorFor: editorForNode,
        syncToolbar: syncButtonStates
    };
})(window);
