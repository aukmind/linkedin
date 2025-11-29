const { createApp, ref, computed, nextTick, reactive } = Vue;

const app = createApp({
  setup() {
    const editorContent = ref("");
    const charCount = computed(
      () => (editorContent.value.innerText || editorContent.value).length
    );
    const copyFeedback = ref("");

    const pendingFormatting = reactive({
      isBold: false,
      isItalic: false,
      isScript: false,
      isSans: false,
    });

    const initialConfig = localStorage.getItem("typographyConfig")
      ? JSON.parse(localStorage.getItem("typographyConfig"))
      : {};
    const config = reactive({
      italic: initialConfig.italic || "serif",
      boldItalic: initialConfig.boldItalic || "serif",
      configContentVisible: false,
    });

    const editorRef = ref(null);
    const boldBtnRef = ref(null);
    const italicBtnRef = ref(null);
    const scriptBtnRef = ref(null);

    function getStyleNameFromState(state) {
      if (state.isScript) return "script";

      let preferSans = true; // Serif italic bugs on h

      const italicStyleValue = config.italic;
      const boldItalicStyleValue = config.boldItalic;

      if (state.isBold && state.isItalic) {
        if (boldItalicStyleValue === "sans-serif") preferSans = true;
      } else if (state.isItalic) {
        if (italicStyleValue === "sans-serif") preferSans = true;
      } else if (state.isBold) {
        if (state.isSans) preferSans = true;
      } else {
        preferSans = state.isSans;
      }

      if (preferSans) {
        if (state.isBold && state.isItalic) return "sans-serif-bold-italic";
        else if (state.isItalic) return "sans-serif-italic";
        else if (state.isBold) return "sans-serif-bold";
        else return "sans-serif";
      } else {
        if (state.isBold && state.isItalic) return "bold-italic";
        else if (state.isItalic) return "italic";
        else if (state.isBold) return "bold";
      }
      return "";
    }

    function inferStateFromContext(textNode, offset) {
      let i = offset - 1;
      while (i >= 0) {
        const char = textNode.textContent[i];
        if (char.trim().length === 0) {
          i--;
          continue;
        }
        const state = window.getFormattingState(char);
        return {
          isBold: state.isBold,
          isItalic: state.isItalic,
          isScript: state.isScript,
          isSans: state.isSans,
        };
      }
      return { isBold: false, isItalic: false, isScript: false, isSans: false };
    }

    // --- Methods: Core Editor Logic ---
    function handleInput(event) {
      if (event.inputType === "insertText" && event.data) {
        applyPendingFormatting(event.data);
        editorContent.value = editorRef.value.innerText;
      } else {
        editorContent.value = editorRef.value.innerText;
      }
      updateToolbarState();
    }

    // Explicitly handle shortcuts to avoid blocking normal typing
    function handleKeydown(e) {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isCtrlOrMeta) {
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          toggleFormat("bold");
          return;
        }
        if (e.key === "i" || e.key === "I") {
          e.preventDefault();
          toggleFormat("italic");
          return;
        }
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          toggleFormat("script");
          return;
        }
      }
    }

    function applyPendingFormatting(char) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0 || !selection.getRangeAt(0).collapsed)
        return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      const offset = range.startOffset;

      if (textNode.nodeType !== Node.TEXT_NODE || offset === 0) return;

      let activeState = pendingFormatting;

      if (!activeState.isBold && !activeState.isItalic && !activeState.isScript)
        return;

      if (char.trim().length === 0) return;

      const charToConvert = textNode.textContent.substring(offset - 1, offset);
      const styleName = getStyleNameFromState(activeState);

      if (styleName) {
        try {
          const converted = window.convert_to(charToConvert, styleName);

          if (converted !== charToConvert) {
            const prefix = textNode.textContent.substring(0, offset - 1);
            const suffix = textNode.textContent.substring(offset);
            textNode.textContent = prefix + converted + suffix;

            const newRange = document.createRange();
            const newOffset = offset - 1 + converted.length;
            newRange.setStart(textNode, newOffset);
            newRange.setEnd(textNode, newOffset);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (e) {
          console.error("Unicode conversion error:", e);
        }
      }
    }

    function toggleFormat(formatType) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        if (
          !pendingFormatting.isBold &&
          !pendingFormatting.isItalic &&
          !pendingFormatting.isScript
        ) {
          Object.assign(
            pendingFormatting,
            inferStateFromContext(range.startContainer, range.startOffset)
          );
        }

        if (formatType === "script") {
          pendingFormatting.isScript = !pendingFormatting.isScript;
          if (pendingFormatting.isScript) {
            pendingFormatting.isBold = false;
            pendingFormatting.isItalic = false;
          }
        } else if (formatType === "bold") {
          pendingFormatting.isBold = !pendingFormatting.isBold;
          if (pendingFormatting.isBold) pendingFormatting.isScript = false;
        } else if (formatType === "italic") {
          pendingFormatting.isItalic = !pendingFormatting.isItalic;
          if (pendingFormatting.isItalic) pendingFormatting.isScript = false;
        }

        updateToolbarState();
        editorRef.value.focus();
        return;
      }

      let selectedText = range.toString();
      if (!selectedText) return;

      const normalText = window.normalize(selectedText);
      const formattingState = window.getFormattingState(selectedText);

      let targetState = {
        isBold: formattingState.isBold,
        isItalic: formattingState.isItalic,
        isScript: formattingState.isScript,
        isSans: formattingState.isSans,
      };

      if (formatType === "script") {
        targetState.isScript = !targetState.isScript;
        if (targetState.isScript) {
          targetState.isBold = false;
          targetState.isItalic = false;
        }
      } else if (formatType === "bold") {
        targetState.isBold = !targetState.isBold;
        if (targetState.isBold) targetState.isScript = false;
      } else if (formatType === "italic") {
        targetState.isItalic = !targetState.isItalic;
        if (targetState.isItalic) targetState.isScript = false;
      }

      const styleName = getStyleNameFromState(targetState);
      let formattedText = normalText;

      if (styleName) {
        try {
          formattedText = window.convert_to(normalText, styleName);
        } catch (e) {
          formattedText = normalText;
        }
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
      Object.assign(pendingFormatting, {
        isBold: false,
        isItalic: false,
        isScript: false,
      });
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const editorEl = editorRef.value;

      if (range.collapsed) {
        const walker = document.createTreeWalker(
          editorEl,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        let node;
        const changes = [];
        while ((node = walker.nextNode())) {
          if (window.hasUnicodeFormatting(node.textContent)) {
            changes.push({ node, text: window.normalize(node.textContent) });
          }
        }
        changes.forEach((change) => (change.node.textContent = change.text));
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
      if (confirm("Are you sure you want to clear the editor?")) {
        editorRef.value.innerHTML = "";
        editorContent.value = "";
        Object.assign(pendingFormatting, {
          isBold: false,
          isItalic: false,
          isScript: false,
        });
        editorRef.value.focus();
        updateToolbarState();
      }
    }

    function updateToolbarState() {
      const selection = window.getSelection();
      if (
        !selection.rangeCount ||
        !editorRef.value ||
        !editorRef.value.contains(selection.anchorNode)
      ) {
        Object.assign(pendingFormatting, {
          isBold: false,
          isItalic: false,
          isScript: false,
        });
      }

      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          if (
            !pendingFormatting.isBold &&
            !pendingFormatting.isItalic &&
            !pendingFormatting.isScript
          ) {
            const inferredState = inferStateFromContext(
              range.startContainer,
              range.startOffset
            );
            Object.assign(pendingFormatting, inferredState);
          }
        } else {
          if (
            !pendingFormatting.isBold &&
            !pendingFormatting.isItalic &&
            !pendingFormatting.isScript
          ) {
            Object.assign(pendingFormatting, {
              isBold: false,
              isItalic: false,
              isScript: false,
            });
          }
        }
      } else {
        const textToCheck = range.toString();
        if (textToCheck) {
          const formattingState = window.getFormattingState(textToCheck);
          Object.assign(pendingFormatting, formattingState);
        } else {
          Object.assign(pendingFormatting, {
            isBold: false,
            isItalic: false,
            isScript: false,
          });
        }
      }

      if (boldBtnRef.value)
        boldBtnRef.value.classList.toggle("active", pendingFormatting.isBold);
      if (italicBtnRef.value)
        italicBtnRef.value.classList.toggle(
          "active",
          pendingFormatting.isItalic
        );
      if (scriptBtnRef.value)
        scriptBtnRef.value.classList.toggle(
          "active",
          pendingFormatting.isScript
        );
    }

    function handleSelectionChange() {
      nextTick(updateToolbarState);
    }

    function showFeedback(message, isError = false) {
      copyFeedback.value = message;
      const element = document.getElementById("copyFeedback");
      if (element) {
        element.className = "info-message show";
        element.style.backgroundColor = isError ? "#ffe6e6" : "#e6f3ff";
        element.style.color = isError ? "#d11124" : "#0077b5";
        setTimeout(() => {
          element.classList.remove("show");
        }, 3000);
      }
    }

    async function copyToClipboard() {
      const formattedText =
        editorRef.value.innerText || editorRef.value.textContent || "";
      const trimmedText = formattedText.trim();

      if (!trimmedText.length) {
        showFeedback("⚠ Editor is empty. Please add some content first.", true);
        return;
      }

      const cleanText = trimmedText
        .replace(/\n\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cleanText);
          showFeedback(
            "✓ Copied with Unicode formatting! You can now paste it into LinkedIn."
          );
        } else {
          fallbackCopyText(cleanText);
          showFeedback("✓ Copied with Unicode formatting (fallback method).");
        }
      } catch (err) {
        console.error("Failed to copy:", err);
        showFeedback(
          "✗ Failed to copy. Please select and copy manually.",
          true
        );
      }
    }

    function fallbackCopyText(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-999999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }

    function handleConfigUpdate() {
      const newConfig = {
        italic: config.italic,
        boldItalic: config.boldItalic,
        script: config.scriptEnabled,
      };
      localStorage.setItem("typographyConfig", JSON.stringify(newConfig));
      showFeedback("✓ Settings saved!");
    }

    document.addEventListener("selectionchange", handleSelectionChange);

    return {
      editorContent,
      charCount,
      copyFeedback,
      pendingFormatting,
      config,
      editorRef,
      boldBtnRef,
      italicBtnRef,
      scriptBtnRef,
      handleInput,
      handleKeydown,
      toggleFormat,
      clearFormatting,
      clearEditor,
      copyToClipboard,
      handleConfigUpdate,
      placeholder: "What do you want to talk about?",
    };
  },
  template: `
        <div class="container">
            <header>
                <h1>LinkedIn Post Editor</h1>
                <p class="subtitle">Write bold and italic posts for LinkedIn.</p>
            </header>

            <div class="post-container">
                <div class="post-header">
                    <div class="profile-circle"></div>
                    <div class="user-info">
                        <div class="user-name">Your Name</div>
                        <div class="user-title">Your Title • Your Company</div>
                    </div>
                </div>

                <div class="editor-wrapper">
                    <div 
                        ref="editorRef" 
                        class="editor" 
                        contenteditable="true" 
                        :data-placeholder="placeholder"
                        @input="handleInput"
                        @keydown="handleKeydown"
                    ></div>
                </div>

                <div class="toolbar">
                    <button 
                        ref="boldBtnRef" 
                        class="toolbar-btn" 
                        :class="{ active: pendingFormatting.isBold }" 
                        @click.prevent="toggleFormat('bold')" 
                        title="Bold (Ctrl+B)"
                    >
                        <strong>B</strong>
                    </button>
                    <button 
                        ref="italicBtnRef" 
                        class="toolbar-btn" 
                        :class="{ active: pendingFormatting.isItalic }" 
                        @click.prevent="toggleFormat('italic')" 
                        title="Italic (Ctrl+I)"
                    >
                        <em>I</em>
                    </button>
                    <button 
                        ref="scriptBtnRef" 
                        class="toolbar-btn" 
                        :class="{ active: pendingFormatting.isScript }" 
                        @click.prevent="toggleFormat('script')" 
                        title="Script Style (Ctrl+S)"
                    >
                        𝒮
                    </button>
                    <div class="toolbar-separator"></div>
                    <button class="toolbar-btn" @click.prevent="clearFormatting" title="Clear formatting">
                        Clear
                    </button>
                </div>

                <div class="actions">
                    <div class="char-counter">
                        <span :style="{ color: charCount > 2800 ? '#d11124' : (charCount > 2500 ? '#ff9800' : '') }">{{ charCount }}</span> characters
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn secondary" @click="clearEditor">Clear</button>
                        <button class="action-btn primary" @click="copyToClipboard">Copy to LinkedIn</button>
                    </div>
                </div>
            </div>
            <div class="info-message" id="copyFeedback">{{ copyFeedback }}</div>
        </div>
    `,
}).mount("#app");
