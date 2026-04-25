const { createApp, defineComponent, ref, computed, reactive, nextTick, watch } = Vue;
const naive = window.naive;

const STYLE_OPTIONS = [
  { label: "Serif", value: "serif" },
  { label: "Sans-serif", value: "sans-serif" },
];

const BLANK_STATE = { isBold: false, isItalic: false, isScript: false, isSans: false };
const hasPending = (s) => s.isBold || s.isItalic || s.isScript;

const LinkedinApp = defineComponent({
  template: "#linkedin-app-template",
  setup() {
    const message = naive.useMessage();
    const dialog = naive.useDialog();

    const editorContent = ref("");
    const charCount = computed(() => editorContent.value.length);
    const charCountClass = computed(() => {
      if (charCount.value > 2800) return "char-over";
      if (charCount.value > 2500) return "char-warn";
      return "";
    });

    const pendingFormatting = reactive({
      isBold: false,
      isItalic: false,
      isScript: false,
      isSans: false,
    });

    const savedConfig = JSON.parse(localStorage.getItem("typographyConfig") || "{}");
    const config = reactive({
      italic: savedConfig.italic || "serif",
      boldItalic: savedConfig.boldItalic || "serif",
    });

    const editorRef = ref(null);

    function getStyleNameFromState(state) {
      if (state.isScript) return "script";

      const sans =
        state.isBold && state.isItalic ? config.boldItalic === "sans-serif" :
        state.isItalic ? config.italic === "sans-serif" :
        state.isSans;

      const parts = [];
      if (sans) parts.push("sans-serif");
      if (state.isBold) parts.push("bold");
      if (state.isItalic) parts.push("italic");
      return parts.join("-");
    }

    function inferStateFromContext(textNode, offset) {
      for (let i = offset - 1; i >= 0; i--) {
        const char = textNode.textContent[i];
        if (char.trim().length === 0) continue;
        return window.getFormattingState(char);
      }
      return { ...BLANK_STATE };
    }

    function handleInput(event) {
      if (event.inputType === "insertText" && event.data) {
        applyPendingFormatting(event.data);
      }
      editorContent.value = editorRef.value.innerText;
      updateToolbarState();
    }

    function handleKeydown(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "b") { e.preventDefault(); toggleFormat("bold"); }
      else if (key === "i") { e.preventDefault(); toggleFormat("italic"); }
      else if (key === "s") { e.preventDefault(); toggleFormat("script"); }
    }

    function applyPendingFormatting(char) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0 || !selection.getRangeAt(0).collapsed) return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      const offset = range.startOffset;

      if (textNode.nodeType !== Node.TEXT_NODE || offset === 0) return;
      if (!hasPending(pendingFormatting)) return;
      if (char.trim().length === 0) return;

      const charToConvert = textNode.textContent.substring(offset - 1, offset);
      const styleName = getStyleNameFromState(pendingFormatting);
      if (!styleName) return;

      try {
        const converted = window.convert_to(charToConvert, styleName);
        if (converted === charToConvert) return;

        const prefix = textNode.textContent.substring(0, offset - 1);
        const suffix = textNode.textContent.substring(offset);
        textNode.textContent = prefix + converted + suffix;

        const newRange = document.createRange();
        const newOffset = offset - 1 + converted.length;
        newRange.setStart(textNode, newOffset);
        newRange.setEnd(textNode, newOffset);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } catch (err) {
        console.error("Unicode conversion error:", err);
      }
    }

    function applyToggleToState(state, formatType) {
      const next = { ...state };
      if (formatType === "script") {
        next.isScript = !next.isScript;
        if (next.isScript) { next.isBold = false; next.isItalic = false; }
      } else if (formatType === "bold") {
        next.isBold = !next.isBold;
        if (next.isBold) next.isScript = false;
      } else if (formatType === "italic") {
        next.isItalic = !next.isItalic;
        if (next.isItalic) next.isScript = false;
      }
      return next;
    }

    function toggleFormat(formatType) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        if (!hasPending(pendingFormatting)) {
          Object.assign(pendingFormatting, inferStateFromContext(range.startContainer, range.startOffset));
        }
        Object.assign(pendingFormatting, applyToggleToState(pendingFormatting, formatType));
        updateToolbarState();
        editorRef.value.focus();
        return;
      }

      const selectedText = range.toString();
      if (!selectedText) return;

      const normalText = window.normalize(selectedText);
      const targetState = applyToggleToState(window.getFormattingState(selectedText), formatType);
      const styleName = getStyleNameFromState(targetState);

      let formattedText = normalText;
      if (styleName) {
        try { formattedText = window.convert_to(normalText, styleName); }
        catch { formattedText = normalText; }
      }

      range.deleteContents();
      const textNode = document.createTextNode(formattedText);
      range.insertNode(textNode);

      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.setStart(textNode, 0);
      newRange.setEnd(textNode, formattedText.length);
      selection.addRange(newRange);

      editorContent.value = editorRef.value.innerText;
      editorRef.value.focus();
      Object.assign(pendingFormatting, targetState);
      updateToolbarState();
    }

    function clearFormatting() {
      Object.assign(pendingFormatting, BLANK_STATE);
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const editorEl = editorRef.value;

      if (range.collapsed) {
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          const normalized = window.normalize(node.textContent);
          if (normalized !== node.textContent) node.textContent = normalized;
        }
      } else {
        const selectedText = range.toString();
        if (!selectedText) return;
        const plainText = window.normalize(selectedText);
        range.deleteContents();
        const textNode = document.createTextNode(plainText);
        range.insertNode(textNode);
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(textNode);
        selection.addRange(newRange);
      }

      editorContent.value = editorEl.innerText;
      editorEl.focus();
      updateToolbarState();
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
          Object.assign(pendingFormatting, BLANK_STATE);
          editorRef.value.focus();
          updateToolbarState();
        },
      });
    }

    function updateToolbarState() {
      const selection = window.getSelection();
      if (!selection.rangeCount || !editorRef.value || !editorRef.value.contains(selection.anchorNode)) {
        return;
      }
      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        if (range.startContainer.nodeType === Node.TEXT_NODE && !hasPending(pendingFormatting)) {
          Object.assign(pendingFormatting, inferStateFromContext(range.startContainer, range.startOffset));
        }
        return;
      }

      const textToCheck = range.toString();
      if (textToCheck) {
        Object.assign(pendingFormatting, window.getFormattingState(textToCheck));
      }
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
