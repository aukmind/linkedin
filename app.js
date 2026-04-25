const { createApp, defineComponent, ref, computed, reactive, nextTick, watch } = Vue;
const naive = window.naive;

const STYLE_OPTIONS = [
  { label: "Serif", value: "serif" },
  { label: "Sans-serif", value: "sans-serif" },
];

const blankState = () => ({ isBold: false, isItalic: false, isScript: false, isSans: false });
const hasPending = (s) => s.isBold || s.isItalic || s.isScript;
const sameFormatting = (a, b) =>
  a.isBold === b.isBold && a.isItalic === b.isItalic && a.isScript === b.isScript && a.isSans === b.isSans;

function applyToggleToState(state, formatType) {
  const next = { ...state };
  const key = { bold: "isBold", italic: "isItalic", script: "isScript" }[formatType];
  next[key] = !next[key];
  if (formatType === "script" && next.isScript) {
    next.isBold = false;
    next.isItalic = false;
  } else if (next[key] && (formatType === "bold" || formatType === "italic")) {
    next.isScript = false;
  }
  return next;
}

function replaceRangeWith(range, text) {
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  const sel = window.getSelection();
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.setStart(node, 0);
  newRange.setEnd(node, text.length);
  sel.addRange(newRange);
  return node;
}

const LinkedinApp = defineComponent({
  template: "#linkedin-app-template",
  setup() {
    const message = naive.useMessage();
    const dialog = naive.useDialog();

    const editorRef = ref(null);
    const editorContent = ref("");
    const charCount = computed(() => editorContent.value.length);
    const charCountClass = computed(() =>
      charCount.value > 2800 ? "char-over" :
      charCount.value > 2500 ? "char-warn" : ""
    );

    const pendingFormatting = reactive(blankState());

    const savedConfig = JSON.parse(localStorage.getItem("typographyConfig") || "{}");
    const config = reactive({
      italic: savedConfig.italic || "serif",
      boldItalic: savedConfig.boldItalic || "serif",
    });

    function withConfigSans(state) {
      if (!state.isItalic) return state;
      const wantsSans = state.isBold
        ? config.boldItalic === "sans-serif"
        : config.italic === "sans-serif";
      return { ...state, isSans: wantsSans };
    }

    function inferStateFromContext(textNode, offset) {
      const match = textNode.textContent.slice(0, offset).match(/(\S)\s*$/);
      return match ? window.getFormattingState(match[1]) : blankState();
    }

    function syncEditorContent() {
      editorContent.value = editorRef.value.innerText;
    }

    function applyPendingFormatting(char) {
      if (!hasPending(pendingFormatting) || char.trim().length === 0) return;
      const sel = window.getSelection();
      if (sel.rangeCount === 0 || !sel.getRangeAt(0).collapsed) return;

      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;
      if (node.nodeType !== Node.TEXT_NODE || offset === 0) return;

      const ch = node.textContent.substring(offset - 1, offset);
      const converted = window.convert(ch, withConfigSans(pendingFormatting));
      if (converted === ch) return;

      const text = node.textContent;
      node.textContent = text.slice(0, offset - 1) + converted + text.slice(offset);

      const newRange = document.createRange();
      const newOffset = offset - 1 + converted.length;
      newRange.setStart(node, newOffset);
      newRange.setEnd(node, newOffset);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    function handleInput(event) {
      if (event.inputType === "insertText" && event.data) {
        applyPendingFormatting(event.data);
      }
      syncEditorContent();
    }

    function handleKeydown(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const fmt = { b: "bold", i: "italic", s: "script" }[e.key.toLowerCase()];
      if (fmt) { e.preventDefault(); toggleFormat(fmt); }
    }

    function toggleFormat(formatType) {
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      if (range.collapsed) {
        if (!hasPending(pendingFormatting)) {
          Object.assign(pendingFormatting, inferStateFromContext(range.startContainer, range.startOffset));
        }
        Object.assign(pendingFormatting, applyToggleToState(pendingFormatting, formatType));
        editorRef.value.focus();
        return;
      }

      const selectedText = range.toString();
      if (!selectedText) return;

      const normal = window.normalize(selectedText);
      const target = applyToggleToState(window.getFormattingState(selectedText), formatType);
      const formatted = hasPending(target) ? window.convert(normal, withConfigSans(target)) : normal;

      replaceRangeWith(range, formatted);
      syncEditorContent();
      editorRef.value.focus();
      Object.assign(pendingFormatting, target);
    }

    function clearFormatting() {
      Object.assign(pendingFormatting, blankState());
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      if (range.collapsed) {
        const walker = document.createTreeWalker(editorRef.value, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const normalized = window.normalize(node.textContent);
          if (normalized !== node.textContent) node.textContent = normalized;
        }
      } else {
        const selectedText = range.toString();
        if (!selectedText) return;
        replaceRangeWith(range, window.normalize(selectedText));
      }

      syncEditorContent();
      editorRef.value.focus();
    }

    function clearEditor() {
      dialog.warning({
        title: "Clear editor",
        content: "Are you sure you want to clear the editor?",
        positiveText: "Clear",
        negativeText: "Cancel",
        onPositiveClick: () => {
          editorRef.value.innerHTML = "";
          editorContent.value = "";
          Object.assign(pendingFormatting, blankState());
          editorRef.value.focus();
        },
      });
    }

    function updateToolbarState() {
      const sel = window.getSelection();
      if (!sel.rangeCount || !editorRef.value || !editorRef.value.contains(sel.anchorNode)) return;
      const range = sel.getRangeAt(0);

      let next;
      if (range.collapsed) {
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
        if (hasPending(pendingFormatting)) return;
        next = inferStateFromContext(range.startContainer, range.startOffset);
      } else {
        const text = range.toString();
        if (!text) return;
        next = window.getFormattingState(text);
      }

      if (sameFormatting(next, pendingFormatting)) return;
      Object.assign(pendingFormatting, next);
    }

    async function copyToClipboard() {
      const text = (editorRef.value.innerText || "").trim();
      if (!text) {
        message.warning("Editor is empty. Add some content first.");
        return;
      }
      const cleanText = text.replace(/\n\n/g, "\n").replace(/[ \t]+/g, " ").trim();
      try {
        await navigator.clipboard.writeText(cleanText);
        message.success("Copied with Unicode formatting. Paste it into LinkedIn.");
      } catch (err) {
        console.error("Clipboard write failed:", err);
        message.error("Failed to copy. Please select and copy manually.");
      }
    }

    document.addEventListener("selectionchange", () => nextTick(updateToolbarState));

    const savedFlash = reactive({ italic: false, boldItalic: false });
    const flashTimers = {};

    function persistAndFlash(field) {
      return () => {
        localStorage.setItem(
          "typographyConfig",
          JSON.stringify({ italic: config.italic, boldItalic: config.boldItalic })
        );
        savedFlash[field] = true;
        clearTimeout(flashTimers[field]);
        flashTimers[field] = setTimeout(() => { savedFlash[field] = false; }, 3000);
      };
    }
    watch(() => config.italic, persistAndFlash("italic"));
    watch(() => config.boldItalic, persistAndFlash("boldItalic"));

    return {
      editorRef,
      charCount,
      charCountClass,
      pendingFormatting,
      config,
      savedFlash,
      styleOptions: STYLE_OPTIONS,
      handleInput,
      handleKeydown,
      toggleFormat,
      clearFormatting,
      clearEditor,
      copyToClipboard,
      placeholder: "What do you want to talk about?",
    };
  },
});

const app = createApp({
  setup() {
    return { theme: window.aukmindTheme || null };
  },
});
app.use(naive);
app.component("linkedin-app", LinkedinApp);
app.mount("#app");
