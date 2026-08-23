// The shared writing surface. Templates declare what they allow; they never
// implement editing themselves.
//
//   Editor.mount(bodyEl, { templateId, palette, uploadImage, onChange, onStatus });
//   Editor.sanitizeFor(templateId, html);   // save and render both go through this
//   Editor.hydrateEmbeds(root);             // render time: build the real players
//
// Adding a template means adding one row to CAPABILITIES. Adding a video service
// means adding one row to PROVIDERS.

(function (global) {
    'use strict';

    const PROVIDERS = {
        youtube: {
            label: 'YouTube',
            title: 'YouTube video player',
            valid: id => /^[A-Za-z0-9_-]{11}$/.test(id),
            frame: id => `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
            poster: id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            parse(url) {
                if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
                if (!/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) return null;
                if (url.pathname === '/watch') return url.searchParams.get('v');
                const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
                return match ? match[1] : null;
            }
        },
        vimeo: {
            label: 'Vimeo',
            title: 'Vimeo video player',
            valid: id => /^[0-9]{6,12}$/.test(id),
            frame: id => `https://player.vimeo.com/video/${id}`,
            poster: () => null,
            parse(url) {
                if (!/(^|\.)vimeo\.com$/.test(url.hostname)) return null;
                const match = url.pathname.match(/^\/(?:video\/)?([0-9]{6,12})/);
                return match ? match[1] : null;
            }
        }
    };

    const PROVIDER_NAMES = Object.keys(PROVIDERS);

    // Word-style basics only. No font family, no font size, no justify — those are
    // the knobs that let an author fight the template's own typography.
    //
    // Everything here changes text that already exists, which is why it lives in the
    // selection toolbar. Anything that brings new content into the entry belongs to
    // the insert menu instead.
    const TEXT_COMMANDS = {
        blocks:  ['h2', 'h3', 'quote'],
        marks:   ['bold', 'italic', 'underline', 'strike', 'highlight'],
        actions: ['link', 'alignCenter', 'clear']
    };

    const INSERT_COMMANDS = ['hr'];

    // Typed shortcuts for the same commands the toolbar offers. Lists are absent
    // from both on purpose — a diary is prose.
    const INPUT_RULES = [
        { pattern: /^#\s$/,  tag: 'H2' },
        { pattern: /^##\s$/, tag: 'H3' },
        { pattern: /^>\s$/,  tag: 'BLOCKQUOTE' },
        { pattern: /^---$/,  tag: 'HR', trigger: 'any' }
    ];

    const CAPABILITIES = {
        'field-note':  { commands: TEXT_COMMANDS, align: true, colors: false, media: ['image', 'embed'] },
        'open-sky':    { commands: TEXT_COMMANDS, align: true, colors: false, media: ['image', 'embed'] },
        'open-canvas': { commands: TEXT_COMMANDS, align: true, colors: true,  media: ['image', 'embed'] },
        'column':      { commands: TEXT_COMMANDS, align: true, colors: false, media: ['image', 'embed'] }
    };

    const FALLBACK = CAPABILITIES['field-note'];

    function capabilitiesFor(templateId) {
        return CAPABILITIES[templateId] || FALLBACK;
    }

    function allows(capabilities, medium) {
        return (capabilities.media || []).indexOf(medium) !== -1;
    }

    // One source of truth for what a template may store, read by the editor on save
    // and by the reader on render.
    function sanitizeOptionsFor(templateId) {
        const capabilities = capabilitiesFor(templateId);
        return {
            allowColor:  !!capabilities.colors,
            allowAlign:  !!capabilities.align,
            allowImages: allows(capabilities, 'image'),
            embeds:      allows(capabilities, 'embed') ? PROVIDER_NAMES : [],
            wrapLoose:   true
        };
    }

    function sanitizeFor(templateId, html) {
        return global.RichText.sanitize(html || '', sanitizeOptionsFor(templateId));
    }

    // A seeded empty paragraph is not writing, and a lone photo or video is.
    function isEmpty(html) {
        const holder = document.createElement('div');
        holder.innerHTML = html || '';
        if (holder.querySelector('img, figure[data-embed], hr')) return false;
        return !(holder.textContent || '').trim();
    }

    function parseUrl(value) {
        try { return new URL(String(value).trim()); } catch (err) { return null; }
    }

    function detectEmbed(url) {
        if (!url || url.protocol !== 'https:') return null;
        for (let index = 0; index < PROVIDER_NAMES.length; index += 1) {
            const name     = PROVIDER_NAMES[index];
            const provider = PROVIDERS[name];
            const id       = provider.parse(url);
            if (id && provider.valid(id)) return { provider: name, id: id };
        }
        return null;
    }

    function embedFigure(embed) {
        const figure = document.createElement('figure');
        figure.setAttribute('data-embed', embed.provider);
        figure.setAttribute('data-embed-id', embed.id);
        return figure;
    }

    function readFigureEmbed(figure) {
        const name     = figure.getAttribute('data-embed');
        const id       = figure.getAttribute('data-embed-id') || '';
        const provider = PROVIDERS[name];
        if (!provider || !provider.valid(id)) return null;
        return { provider: name, id: id, definition: provider };
    }

    // Render time. The stored markup holds no frame at all, so the player is built
    // here from the two validated values and dropped into a sandbox.
    function hydrateEmbeds(root) {
        if (!root) return;
        root.querySelectorAll('figure[data-embed]').forEach(figure => {
            const embed = readFigureEmbed(figure);
            if (!embed) {
                figure.remove();
                return;
            }
            const frame = document.createElement('iframe');
            frame.className = 'ed-embed-frame';
            frame.src = embed.definition.frame(embed.id);
            frame.title = embed.definition.title;
            frame.loading = 'lazy';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
            frame.setAttribute('allowfullscreen', '');
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
            figure.className = 'ed-embed';
            figure.replaceChildren(frame);
        });
    }

    // Editor time. A poster card, never a live player: the author is writing, not
    // watching, and an inert card keeps the caret behaviour sane around it.
    function renderEmbedPreviews(root, onRemove) {
        if (!root) return;
        root.querySelectorAll('figure[data-embed]').forEach(figure => {
            const embed = readFigureEmbed(figure);
            if (!embed) {
                figure.remove();
                return;
            }
            figure.className = 'ed-embed ed-embed-preview';
            figure.contentEditable = 'false';

            const poster = embed.definition.poster(embed.id);
            const card   = document.createElement('div');
            card.className = 'ed-embed-card';
            card.innerHTML = `
                ${poster ? `<img class="ed-embed-poster" src="${poster}" alt="">` : ''}
                <span class="ed-embed-badge" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
                <span class="ed-embed-label">${embed.definition.label} video</span>`;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'ed-embed-remove';
            remove.setAttribute('aria-label', `Remove ${embed.definition.label} video`);
            remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
            remove.addEventListener('mousedown', event => {
                event.preventDefault();
                figure.remove();
                if (typeof onRemove === 'function') onRemove();
            });

            figure.replaceChildren(card, remove);
        });
    }

    const state = {
        activeBody: null,
        savedRange: null,
        fileInput: null
    };

    function bodyForNode(node) {
        const element = node && node.nodeType === 1 ? node : node && node.parentElement;
        return element ? element.closest('[data-editor-body="on"]') : null;
    }

    function placeCaret(node) {
        const selection = document.getSelection();
        const range     = document.createRange();
        range.selectNodeContents(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // Media is block level. Dropping it inside the current paragraph produces
    // invalid nesting, so it goes after the block the caret is sitting in.
    function insertBlock(body, node) {
        const block = state.savedRange && body.contains(state.savedRange.startContainer)
            ? blockAncestor(body, state.savedRange.startContainer)
            : null;

        if (block) block.after(node);
        else body.appendChild(node);

        let next = node.nextElementSibling;
        if (!next) {
            next = document.createElement('p');
            next.appendChild(document.createElement('br'));
            node.after(next);
        }
        body.focus();
        placeCaret(next);
    }

    function blockAncestor(body, node) {
        let element = node && node.nodeType === 1 ? node : node && node.parentElement;
        while (element && element !== body) {
            if (element.parentElement === body) return element;
            element = element.parentElement;
        }
        return null;
    }

    function ensureParagraph(body) {
        if (body.querySelector('p, h2, h3, blockquote, ul, ol, figure, hr')) return;
        if ((body.textContent || '').trim()) return;
        const paragraph = document.createElement('p');
        paragraph.appendChild(document.createElement('br'));
        body.replaceChildren(paragraph);
    }

    function fileInput() {
        if (state.fileInput) return state.fileInput;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.className = 'ed-file-input';
        document.body.appendChild(input);
        state.fileInput = input;
        return input;
    }

    function report(options, phase, message) {
        if (typeof options.onStatus === 'function') options.onStatus(phase, message);
    }

    function figureFor(url, alt) {
        const figure  = document.createElement('figure');
        figure.className = 'ed-figure';
        const image   = document.createElement('img');
        image.src = url;
        image.alt = alt || '';
        image.loading = 'lazy';
        image.decoding = 'async';
        const caption = document.createElement('figcaption');
        caption.setAttribute('data-placeholder', 'Add a caption…');
        figure.append(image, caption);
        return figure;
    }

    // The URL is inserted only once the upload resolves, so a blob: preview can
    // never be the value that reaches Firestore — the same discipline the cover
    // image slots use.
    function insertImage(body, options) {
        const input = fileInput();
        input.value = '';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (file) insertImageFile(body, file, options);
        };
        input.click();
    }

    // The replacement is built here rather than through a selection-driven command:
    // the marker text is gone by this point, so there is no selection left to drive one.
    function applyRule(rule, block) {
        if (rule.tag === 'HR') {
            const divider = document.createElement('hr');
            const paragraph = document.createElement('p');
            paragraph.appendChild(document.createElement('br'));
            block.replaceWith(divider);
            divider.after(paragraph);
            placeCaretIn(paragraph);
            return;
        }
        const replacement = document.createElement(rule.tag);
        block.replaceWith(replacement);
        placeCaretIn(replacement);
    }

    // The marker is removed before the block command runs, so the rule never leaves
    // its own syntax behind in the entry.
    function applyInputRules(body, event, options) {
        if (event.inputType !== 'insertText') return;
        const range = document.getSelection().rangeCount
            ? document.getSelection().getRangeAt(0) : null;
        if (!range || !range.collapsed) return;
        const block = RichText.blockFor(body, range.startContainer);
        if (!block) return;

        const text = block.textContent || '';
        for (let index = 0; index < INPUT_RULES.length; index += 1) {
            const rule = INPUT_RULES[index];
            if (rule.trigger !== 'any' && event.data !== ' ') continue;
            if (!rule.pattern.test(text)) continue;
            if (block.tagName !== 'P') continue;
            RichText.record(body, true);
            block.textContent = '';
            applyRule(rule, block);
            if (typeof options.onChange === 'function') options.onChange();
            return;
        }
    }

    // A range inside a childless element does not survive addRange in Chrome, so an
    // empty text node gives the caret something to hold on to.
    function placeCaretIn(node) {
        const selection = document.getSelection();
        const caret = document.createRange();
        if (node.nodeType === 1 && !node.firstChild) {
            node.appendChild(document.createElement('br'));
            caret.setStart(node, 0);
        } else {
            caret.selectNodeContents(node);
        }
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
    }

    function imageFilesFrom(transfer) {
        if (!transfer) return [];
        const files = Array.from(transfer.files || []);
        return files.filter(file => file.type.startsWith('image/'));
    }

    async function insertImageFile(body, file, options) {
        if (typeof options.uploadImage !== 'function') return;
        report(options, 'uploading', 'Uploading photo…');
        try {
            const url = await options.uploadImage(file);
            if (!url) throw new Error('no download URL');
            RichText.record(body, true);
            insertBlock(body, figureFor(url, ''));
            report(options, 'done', '✓ Photo added');
            if (typeof options.onChange === 'function') options.onChange();
        } catch (err) {
            report(options, 'error', `Photo upload failed: ${err.message}`);
        }
    }

    async function insertImageFiles(body, files, options) {
        for (let index = 0; index < files.length; index += 1) {
            await insertImageFile(body, files[index], options);
        }
    }

    function bindDropTarget(body, options) {
        if (typeof options.uploadImage !== 'function') return;
        let depth = 0;

        body.addEventListener('dragenter', event => {
            if (!imageFilesFrom(event.dataTransfer).length &&
                !Array.from(event.dataTransfer.types || []).includes('Files')) return;
            event.preventDefault();
            depth += 1;
            body.classList.add('ed-dropping');
        });
        body.addEventListener('dragover', event => {
            if (!Array.from(event.dataTransfer.types || []).includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });
        body.addEventListener('dragleave', () => {
            depth = Math.max(0, depth - 1);
            if (!depth) body.classList.remove('ed-dropping');
        });
        body.addEventListener('drop', event => {
            const files = imageFilesFrom(event.dataTransfer);
            depth = 0;
            body.classList.remove('ed-dropping');
            if (!files.length) return;
            event.preventDefault();
            // The caret follows the cursor, so a photo lands where it was dropped.
            const caret = caretFromPoint(event.clientX, event.clientY);
            if (caret) {
                const selection = document.getSelection();
                selection.removeAllRanges();
                selection.addRange(caret);
                state.savedRange = caret.cloneRange();
                state.activeBody = body;
            }
            insertImageFiles(body, files, options);
        });
    }

    function caretFromPoint(x, y) {
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
        if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(x, y);
            if (!position) return null;
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
            return range;
        }
        return null;
    }

    // ── FOCUS MODE ──
    // Typing dims the page chrome; any pause or pointer movement brings it back.
    const focus = { timer: null, on: false };

    function setWriting(on) {
        if (focus.on === on) return;
        focus.on = on;
        document.documentElement.toggleAttribute('data-writing', on);
        if (on) global.RichText.hide();
    }

    function noteTyping() {
        setWriting(true);
        clearTimeout(focus.timer);
        focus.timer = setTimeout(() => setWriting(false), 2600);
    }

    function bindFocusMode(body) {
        body.addEventListener('keydown', event => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key && event.key.length > 1 && event.key !== 'Backspace' && event.key !== 'Enter') return;
            noteTyping();
        });
        body.addEventListener('blur', () => setWriting(false));

        if (!bindFocusMode._bound) {
            bindFocusMode._bound = true;
            ['mousemove', 'pointerdown', 'wheel'].forEach(name => {
                window.addEventListener(name, () => {
                    clearTimeout(focus.timer);
                    setWriting(false);
                }, { passive: true });
            });
        }
    }

    function insertEmbed(body, embed, options) {
        const figure = embedFigure(embed);
        insertBlock(body, figure);
        renderEmbedPreviews(body, options.onChange);
        if (typeof options.onChange === 'function') options.onChange();
    }

    function promptForEmbed(body, options) {
        const raw = window.prompt('Paste a YouTube or Vimeo link');
        if (!raw) return;
        const embed = detectEmbed(parseUrl(raw));
        if (!embed) {
            window.alert('That does not look like a YouTube or Vimeo video link.');
            return;
        }
        insertEmbed(body, embed, options);
    }

    function handleSelectionChange() {
        const selection = document.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const body  = bodyForNode(range.startContainer);
        if (!body) return;
        state.activeBody = body;
        state.savedRange = range.cloneRange();
    }

    function handlePaste(event, body, options) {
        const data = event.clipboardData;
        if (!data) return;

        const images = imageFilesFrom(data);
        if (images.length) {
            event.preventDefault();
            insertImageFiles(body, images, options);
            return;
        }

        const text  = (data.getData('text/plain') || '').trim();
        const embed = options.capabilities.embedsAllowed ? detectEmbed(parseUrl(text)) : null;
        if (embed && !/\s/.test(text)) {
            event.preventDefault();
            insertEmbed(body, embed, options);
            return;
        }

        const html = data.getData('text/html');
        if (!html) return;
        // Pasted markup is held to the template's own allowlist here rather than at
        // save time, so what lands on screen is what gets stored.
        event.preventDefault();
        const clean = sanitizeFor(options.templateId, html);
        try { document.execCommand('insertHTML', false, clean); } catch (err) {}
        if (typeof options.onChange === 'function') options.onChange();
    }

    function mount(body, options) {
        if (!body) return;
        const settings     = options || {};
        const templateId   = settings.templateId;
        const capabilities = capabilitiesFor(templateId);
        const imagesOn     = allows(capabilities, 'image') && typeof settings.uploadImage === 'function';
        const embedsOn     = allows(capabilities, 'embed');

        const context = {
            templateId: templateId,
            onChange: settings.onChange,
            onStatus: settings.onStatus,
            uploadImage: settings.uploadImage,
            capabilities: { embedsAllowed: embedsOn }
        };

        // Media commands close over this body, so they are built per mount rather
        // than declared in the static capability table.
        const media = [];
        if (imagesOn) media.push({ icon: 'fa-solid fa-image', label: 'Photo', run: () => insertImage(body, context) });
        if (embedsOn) media.push({ icon: 'fa-solid fa-play',  label: 'Video', run: () => promptForEmbed(body, context) });

        const rows = capabilities.commands;
        const commands = [
            rows.blocks.slice(),
            rows.marks.slice(),
            rows.actions.slice()
        ].filter(row => row.length);
        const inserts = media.concat(INSERT_COMMANDS);

        body.setAttribute('data-editor-body', 'on');
        body.classList.add('ed-content');
        body._editorConfig = { commands: commands, inserts: inserts };

        global.RichText.attach(body, {
            commands: commands,
            inserts: inserts,
            palette: capabilities.colors ? settings.palette : null,
            onChange: settings.onChange
        });

        body.addEventListener('paste', event => handlePaste(event, body, context));
        body.addEventListener('input', event => applyInputRules(body, event, context));
        bindDropTarget(body, context);
        bindFocusMode(body);

        // A photo's caption is also its alt text — one thing to write, not two.
        body.addEventListener('input', event => {
            const caption = event.target && event.target.closest
                ? event.target.closest('figcaption')
                : null;
            if (!caption || !body.contains(caption)) return;
            const image = caption.parentElement && caption.parentElement.querySelector('img');
            if (image) image.alt = (caption.textContent || '').trim();
        });

        body.addEventListener('focus', () => ensureParagraph(body));

        renderEmbedPreviews(body, settings.onChange);
        ensureParagraph(body);

        if (!mount._bound) {
            mount._bound = true;
            document.addEventListener('selectionchange', handleSelectionChange);
        }
    }

    global.Editor = {
        mount: mount,
        capabilitiesFor: capabilitiesFor,
        sanitizeOptionsFor: sanitizeOptionsFor,
        sanitizeFor: sanitizeFor,
        ensureParagraph: ensureParagraph,
        isEmpty: isEmpty,
        hydrateEmbeds: hydrateEmbeds,
        renderEmbedPreviews: renderEmbedPreviews,
        detectEmbed: detectEmbed,
        parseUrl: parseUrl,
        providers: PROVIDERS
    };
})(window);
