// CRITICAL FILE
// EDITOR TOOLS FILE IS NEEDED FOR IMAGE AND TEXT EDITOR TO FUNCTION PROPERLY, DO NOT TOUCH
(function () {
  // ============================================================================
  // SHARED STATE AND UTILITIES
  // ============================================================================

  let isInspectorActive = false;
  let isEditorActive = false;
  let inspectorStyle = null;
  let textEditorStyle = null;
  let currentHighlight = null;
  let selectedElementRef = null;
  let originalComponentData = null;

  const textElements = [
    "span",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "button",
    "a",
    "label",
  ];

  // Function to debug events in parent component
  function debug(...args) {
    window.parent.postMessage(
      {
        type: "CONSOLE_LOG",
        value: args.join(", "),
      },
      "*"
    );
  }

  // Function to get relevant styles
  function getRelevantStyles(element) {
    const computedStyles = window.getComputedStyle(element);
    const relevantProps = [
      "display",
      "position",
      "width",
      "height",
      "margin",
      "padding",
      "border",
      "background",
      "color",
      "font-size",
      "font-weight",
      "font-style",
      "font-family",
      "text-align",
      "flex-direction",
      "justify-content",
      "align-items",
    ];

    const styles = {};
    relevantProps.forEach((prop) => {
      const value = computedStyles.getPropertyValue(prop);
      if (value) {
        styles[prop] = value;
      }
    });

    return styles;
  }

  // Function to create a readable element selector
  function createReadableSelector(element) {
    let selector = element.tagName.toLowerCase();

    // Add ID if present
    if (element.id) {
      selector += `#${element.id}`;
    }

    // Add classes if present
    let className = "";
    if (element.className) {
      if (typeof element.className === "string") {
        className = element.className;
      } else if (element.className.baseVal !== undefined) {
        className = element.className.baseVal;
      } else {
        className = element.className.toString();
      }

      if (className.trim()) {
        const classes = className.trim().split(/\s+/).slice(0, 3); // Limit to first 3 classes
        selector += `.${classes.join(".")}`;
      }
    }

    return selector;
  }

  // Function to create element display text
  function createElementDisplayText(element) {
    const tagName = element.tagName.toLowerCase();
    let displayText = `<${tagName}`;

    // Add ID attribute
    if (element.id) {
      displayText += ` id="${element.id}"`;
    }

    // Add class attribute (limit to first 3 classes for readability)
    let className = "";
    if (element.className) {
      if (typeof element.className === "string") {
        className = element.className;
      } else if (element.className.baseVal !== undefined) {
        className = element.className.baseVal;
      } else {
        className = element.className.toString();
      }

      if (className.trim()) {
        const classes = className.trim().split(/\s+/);
        const displayClasses =
          classes.length > 3
            ? classes.slice(0, 3).join(" ") + "..."
            : classes.join(" ");
        displayText += ` class="${displayClasses}"`;
      }
    }

    // Add other important attributes
    const importantAttrs = ["type", "name", "href", "src", "alt", "title"];
    importantAttrs.forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value) {
        const truncatedValue =
          value.length > 30 ? value.substring(0, 30) + "..." : value;
        displayText += ` ${attr}="${truncatedValue}"`;
      }
    });

    displayText += ">";

    // Add text content preview for certain elements
    if (textElements.includes(tagName) && element.textContent) {
      const textPreview = element.textContent.trim().substring(0, 50);
      if (textPreview) {
        displayText +=
          textPreview.length < element.textContent.trim().length
            ? textPreview + "..."
            : textPreview;
      }
    }

    displayText += `</${tagName}>`;
    return displayText;
  }

  // Helper function to get element class name consistently
  function getElementClassName(element) {
    if (!element.className) {
      return "";
    }

    if (typeof element.className === "string") {
      return element.className;
    } else if (element.className.baseVal !== undefined) {
      return element.className.baseVal;
    } else {
      return element.className.toString();
    }
  }

  function getElementPath(element) {
    return getElementLocPath(element) || getElementCSSPath(element);
  }

  function getElementLocPath(element) {
    const path = [];
    let current = element;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      if (current && current.dataset && current.dataset.loc) {
        path.unshift(current.dataset.loc);
      }
      current = current.parentElement;
      // Limit path length
      if (path.length >= 10) {
        break;
      }
    }

    return path.join(" > ");
  }

  // Function to get element path (breadcrumb)
  function getElementCSSPath(element) {
    const path = [];
    let current = element;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      let pathSegment = current.tagName.toLowerCase();

      if (current.id) {
        pathSegment += `#${current.id}`;
      } else if (current.className) {
        const className = getElementClassName(current);
        if (className.trim()) {
          const firstClass = className.trim().split(/\s+/)[0];
          pathSegment += `.${firstClass}`;
        }
      }

      path.unshift(pathSegment);
      current = current.parentElement;
      // Limit path length
      if (path.length >= 5) {
        break;
      }
    }

    return path.join(" > ");
  }

  // Function to create element info
  function createElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const location = element.dataset.loc?.split(":");
    const repoFilePath = location?.[0];
    const repoLine = location?.[1];

    return {
      tagName: element.tagName,
      className: getElementClassName(element),
      id: element.id || "",
      textContent: element.textContent?.slice(0, 100) || "",
      styles: getRelevantStyles(element),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      },
      // Add new readable formats
      selector: createReadableSelector(element),
      displayText: createElementDisplayText(element),
      elementPath: getElementPath(element),
      repoFilePath,
      repoLine,
      isTextElement: textElements.includes(element.tagName.toLowerCase()),
    };
  }

  function handleMouseLeave() {
    if (!isInspectorActive && !isEditorActive) {
      return;
    }

    // Remove highlight (but don't remove persistent highlights)
    if (currentHighlight && currentHighlight !== selectedElementRef) {
      currentHighlight.classList.remove("inspector-highlight");
      currentHighlight.classList.remove("editor-highlight");
    }

    currentHighlight = null;
  }

  // ============================================================================
  // INSPECTOR FUNCTIONALITY
  // ============================================================================

  function ensureInspectorStyles() {
    if (!inspectorStyle) {
      inspectorStyle = document.createElement("style");
      inspectorStyle.textContent = `
        .inspector-active * {
          cursor: crosshair !important;
        }
        .inspector-highlight {
          outline: 2px solid #3b82f6 !important;
          outline-offset: -2px !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
      `;
      document.head.appendChild(inspectorStyle);
    }
  }

  function handleInspectorMouseMove(e) {
    if (!isInspectorActive) {
      return;
    }

    const target = e.target;
    if (
      !target ||
      target === document.body ||
      target === document.documentElement
    ) {
      return;
    }

    // Skip hover effects on persistently selected elements
    if (target === selectedElementRef) {
      if (currentHighlight && currentHighlight !== selectedElementRef) {
        currentHighlight.classList.remove("inspector-highlight");
      }
      currentHighlight = null;
      return;
    }

    // Remove previous highlight (but not from selected element)
    if (currentHighlight && currentHighlight !== selectedElementRef) {
      currentHighlight.classList.remove("inspector-highlight");
    }

    // Add highlight to current element
    target.classList.add("inspector-highlight");
    currentHighlight = target;

    const elementInfo = createElementInfo(target);

    // Send message to parent
    window.parent.postMessage(
      {
        type: "INSPECTOR_HOVER",
        elementInfo,
      },
      "*"
    );
  }

  function handleInspectorClick(e) {
    if (!isInspectorActive) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    if (
      !target ||
      target === document.body ||
      target === document.documentElement
    ) {
      return;
    }

    ensureInspectorStyles();

    // Clear previous selection if selecting a different element
    if (selectedElementRef && selectedElementRef !== target) {
      selectedElementRef.classList.remove("inspector-highlight");
    }

    // Store selected element for persistence
    selectedElementRef = target;
    target.classList.add("inspector-highlight");

    const elementInfo = createElementInfo(target);

    // Send regular inspector click message
    window.parent.postMessage(
      {
        type: "INSPECTOR_CLICK",
        elementInfo,
      },
      "*"
    );
  }

  function setInspectorActive(active) {
    isInspectorActive = active;

    if (active) {
      ensureInspectorStyles();
      document.body.classList.add("inspector-active");

      // Add event listeners
      document.addEventListener("mousemove", handleInspectorMouseMove, true);
      document.addEventListener("click", handleInspectorClick, true);
      document.addEventListener("mouseleave", handleMouseLeave, true);
    } else {
      document.body.classList.remove("inspector-active");

      // Remove hover highlights but keep selected element highlighted
      if (currentHighlight && currentHighlight !== selectedElementRef) {
        currentHighlight.classList.remove("inspector-highlight");
      }
      currentHighlight = null;

      // Remove event listeners
      document.removeEventListener("mousemove", handleInspectorMouseMove, true);
      document.removeEventListener("click", handleInspectorClick, true);
      document.removeEventListener("mouseleave", handleMouseLeave, true);

      // Only remove styles if inspector is off AND no element is selected
      if (!selectedElementRef && inspectorStyle) {
        inspectorStyle.remove();
        inspectorStyle = null;
      }
    }
  }

  // ============================================================================
  // EDITOR MODE FUNCTIONALITY
  // ============================================================================

  // Function to copy all computed styles from source to target element
  function copyAllStyles(sourceElement, targetElement) {
    const computedStyles = window.getComputedStyle(sourceElement);

    // Get all style properties
    for (let i = 0; i < computedStyles.length; i++) {
      const property = computedStyles[i];
      const value = computedStyles.getPropertyValue(property);

      // Skip properties that shouldn't be copied or might cause issues
      const skipProperties = [
        "width",
        "height", // Will be set separately to match exact dimensions
        "position", // Might interfere with layout
        "z-index",
        "transform",
        "transition",
        "animation",
      ];

      if (!skipProperties.includes(property)) {
        targetElement.style.setProperty(property, value);
      }
    }

    if (targetElement.tagName === "TEXTAREA") {
      // Set exact dimensions and position
      const rect = sourceElement.getBoundingClientRect();
      targetElement.style.width = rect.width + "px";
      targetElement.style.height = "100%";

      // Ensure textarea-specific styles
      targetElement.style.resize = "none";
      targetElement.style.outline = "none";
      targetElement.style.border = computedStyles.border || "1px solid #ccc";
      targetElement.style.boxSizing = "border-box";
    }
  }

  // Function to check if element contains only plain text
  function hasPlainTextContent(element) {
    // Check if element has text content
    if (!element.textContent || !element.textContent.trim()) {
      return false;
    }

    // Check if element is a text element type
    if (!textElements.includes(element.tagName.toLowerCase())) {
      return false;
    }

    // Check if the element has only text nodes (no child elements)
    const hasOnlyTextNodes = Array.from(element.childNodes).every(
      (node) =>
        node.nodeType === Node.TEXT_NODE ||
        (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length === 0)
    );

    // Additional check: ensure the text content matches the combined text of all text nodes
    const textNodesContent = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("");

    // If element has child elements, check if they are simple inline elements with text
    if (!hasOnlyTextNodes) {
      const childElements = Array.from(element.children);
      const hasComplexChildren = childElements.some((child) => {
        return (
          child.children.length > 0 ||
          !textElements.includes(child.tagName.toLowerCase()) ||
          !child.textContent.trim()
        );
      });

      if (hasComplexChildren) {
        return false;
      }
    }

    return (
      element.textContent.trim() === textNodesContent.trim() || hasOnlyTextNodes
    );
  }

  // Function to check if element is eligible for image editing
  function isImageElement(element) {
    // Check if it's an img tag
    if (element.tagName.toLowerCase() === "img") {
      return true;
    }

    // Check if element has background image in its styles
    const computedStyles = window.getComputedStyle(element);
    const backgroundImage = computedStyles.getPropertyValue("background-image");

    // Check for background-image property that contains url()
    if (
      backgroundImage &&
      backgroundImage !== "none" &&
      backgroundImage.includes("url(")
    ) {
      return true;
    }

    // If current element is not an image, check if any of the parent's children are image elements
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      for (const sibling of siblings) {
        // Check if sibling is an img tag
        if (sibling.tagName.toLowerCase() === "img") {
          return true;
        }

        // Check if sibling has background image
        const siblingStyles = window.getComputedStyle(sibling);
        const siblingBgImage =
          siblingStyles.getPropertyValue("background-image");
        if (
          siblingBgImage &&
          siblingBgImage !== "none" &&
          siblingBgImage.includes("url(")
        ) {
          return true;
        }
      }
    }

    return false;
  }

  // Function to get the actual image element (returns the element itself or a sibling with an image)
  function getImageElement(element) {
    // Check if the element itself is an img tag
    if (element.tagName.toLowerCase() === "img") {
      return element;
    }

    // Check if element has background image in its styles
    const computedStyles = window.getComputedStyle(element);
    const backgroundImage = computedStyles.getPropertyValue("background-image");

    // If element has background image, return it
    if (
      backgroundImage &&
      backgroundImage !== "none" &&
      backgroundImage.includes("url(")
    ) {
      return element;
    }

    // If current element is not an image, check if any of the parent's children are image elements
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      for (const sibling of siblings) {
        // Check if sibling is an img tag
        if (sibling.tagName.toLowerCase() === "img") {
          return sibling;
        }

        // Check if sibling has background image
        const siblingStyles = window.getComputedStyle(sibling);
        const siblingBgImage =
          siblingStyles.getPropertyValue("background-image");
        if (
          siblingBgImage &&
          siblingBgImage !== "none" &&
          siblingBgImage.includes("url(")
        ) {
          return sibling;
        }
      }
    }

    // Return null if no image element found
    return null;
  }

  // Function to extract image information from element
  function getImageInfo(element) {
    const imageInfo = {
      type: null,
      src: null,
      alt: null,
      backgroundImage: null,
      backgroundSize: null,
      objectFit: null,
      naturalWidth: null,
      naturalHeight: null,
    };

    const computedStyles = window.getComputedStyle(element);

    if (element.tagName.toLowerCase() === "img") {
      imageInfo.type = "img";
      imageInfo.src = element.src || element.getAttribute("src");
      imageInfo.alt = element.alt || element.getAttribute("alt");
      imageInfo.objectFit = computedStyles.objectFit;

      // Get natural dimensions for img elements
      if (element.naturalWidth && element.naturalHeight) {
        imageInfo.naturalWidth = element.naturalWidth;
        imageInfo.naturalHeight = element.naturalHeight;
      }
    } else {
      const backgroundImage =
        computedStyles.getPropertyValue("background-image");
      const backgroundSize = computedStyles.getPropertyValue("background-size");

      if (
        backgroundImage &&
        backgroundImage !== "none" &&
        backgroundImage.includes("url(")
      ) {
        imageInfo.type = "background";
        imageInfo.backgroundImage = backgroundImage;
        imageInfo.backgroundSize = backgroundSize;

        // Extract URL from background-image property
        const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (urlMatch) {
          imageInfo.src = urlMatch[1];
        }
      }
    }

    return imageInfo;
  }

  // Function to auto-resize textarea based on content
  function autoResizeTextarea(textarea) {
    // Set height to scrollHeight to fit content
    textarea.style.height = textarea.scrollHeight + "px";
  }

  // Text formatting utility functions
  function convertToNumberedList(text) {
    if (!text.trim()) {
      return text;
    }

    const lines = text.split("\n").filter((line) => line.trim() !== "");
    return lines
      .map((line, index) => `${index + 1}. ${line.trim()}`)
      .join("\n");
  }

  function convertToBulletList(text) {
    if (!text.trim()) {
      return text;
    }

    const lines = text.split("\n").filter((line) => line.trim() !== "");
    return lines.map((line) => `• ${line.trim()}`).join("\n");
  }

  function isNumberedList(text) {
    if (!text.trim()) {
      return false;
    }

    const lines = text.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      return false;
    }

    // Check if most lines start with number pattern (1. 2. 3. etc.)
    const numberedLines = lines.filter((line) => /^\d+\.\s/.test(line.trim()));
    return numberedLines.length >= Math.ceil(lines.length * 0.7); // At least 70% of lines should be numbered
  }

  function isBulletList(text) {
    if (!text.trim()) {
      return false;
    }

    const lines = text.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      return false;
    }

    // Check if most lines start with bullet pattern (• or - or *)
    const bulletLines = lines.filter((line) => /^[•\-\*]\s/.test(line.trim()));
    return bulletLines.length >= Math.ceil(lines.length * 0.7); // At least 70% of lines should be bullets
  }

  function convertToPlainText(text) {
    if (!text.trim()) {
      return text;
    }

    const lines = text.split("\n");
    return lines
      .map((line) => {
        // Remove numbered list markers (1. 2. 3. etc.)
        let cleanLine = line.replace(/^\s*\d+\.\s*/, "");
        // Remove bullet markers (• - *)
        cleanLine = cleanLine.replace(/^\s*[•\-\*]\s*/, "");
        return cleanLine;
      })
      .join("\n");
  }

  // Function to update original element with updated text
  function updateOriginalElement(textarea, originalElementInfo, shouldUpdate) {
    // Create new element with same tag as original
    const newElement = document.createElement(originalElementInfo.tagName);
    newElement.removeAttribute("id");

    if (originalElementInfo.className) {
      newElement.className = originalElementInfo.className;
    }

    if (shouldUpdate) {
      if (textarea.style.fontSize) {
        newElement.style.fontSize = textarea.style.fontSize;
      }
      if (textarea.style.fontStyle) {
        newElement.style.fontStyle = textarea.style.fontStyle;
      }
      if (textarea.style.fontWeight) {
        newElement.style.fontWeight = textarea.style.fontWeight;
      }
      if (textarea.style.textAlign) {
        newElement.style.textAlign = textarea.style.textAlign;
      }
    }

    Object.assign(newElement.dataset, textarea.dataset);

    // Copy other attributes from original element info
    if (originalElementInfo.attributes) {
      originalElementInfo.attributes.forEach((attr) => {
        if (attr.name !== "id" && attr.name !== "class") {
          newElement.setAttribute(attr.name, attr.value);
        }
      });
    }

    // Set the updated text content from textarea
    const textValue =
      textarea.value !== "" && shouldUpdate
        ? textarea.value
        : originalElementInfo.textContent;

    // Check if textarea value is multiline and handle <br /> insertion
    if (textarea.value && textarea.value.includes("\n")) {
      // For multiline content, convert newlines to <br /> tags and set as innerHTML
      const htmlContent = textValue.replace(/\n/g, "<br />");
      newElement.innerHTML = htmlContent;
    } else {
      // For single line content, use textContent as before
      newElement.textContent = textValue;
    }

    // Replace textarea with restored element
    textarea.parentNode.replaceChild(newElement, textarea);

    // Update selectedElementRef to the new element
    if (selectedElementRef === textarea) {
      selectedElementRef = newElement;
      newElement.classList.add("editor-highlight");
    }

    return newElement;
  }

  // Function to replace element with textarea
  function replaceWithTextarea(element) {
    // Store original element information for restoration in separate variable
    originalComponentData = createElementInfo(element);

    // Create textarea element
    const textarea = document.createElement("textarea");
    textarea.id = "edited-element";

    // Copy the text content, handling <br /> tags conversion to newlines
    let textValue = "";

    // Check if element has any form of <br> tags (including <br>, <br/>, <br />)
    if (element.innerHTML && /<br\b[^>]*\/?>/gi.test(element.innerHTML)) {
      // If element has <br> tags, convert them to newlines
      textValue = element.innerHTML.replace(/<br\b[^>]*\/?>/gi, "\n");
      console.log("textValue", textValue);

      // Remove any remaining HTML tags to get clean text
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = textValue;
      textValue = tempDiv.textContent || tempDiv.innerText || "";
    } else {
      // Use textContent as before for elements without <br> tags
      textValue = element.textContent || "";
    }

    textarea.value = textValue;
    Object.assign(textarea.dataset, element.dataset);

    // Copy all styles
    copyAllStyles(element, textarea);

    // Add a class to identify our replaced elements
    textarea.classList.add("text-editor-replaced-textarea");

    // Replace the element
    element.parentNode.replaceChild(textarea, element);

    // Auto-resize textarea to fit content initially
    autoResizeTextarea(textarea);

    // Focus the textarea and select all text
    textarea.focus();

    // Add event listener for input to auto-resize
    textarea.addEventListener("input", (e) => {
      e.preventDefault();
      autoResizeTextarea(textarea);
      window.parent.postMessage(
        {
          type: "TEXT_EDITOR_TEXT_CHANGE",
          value: e.target.value,
        },
        "*"
      );
    });

    return textarea;
  }

  function ensureEditorStyles() {
    if (!textEditorStyle) {
      textEditorStyle = document.createElement("style");
      textEditorStyle.textContent = `
        .text-editor-active * {
          cursor: crosshair !important;
        }
        .editor-highlight {
          outline: 2px solid #3b82f6 !important;
          outline-offset: -2px !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
      `;
      document.head.appendChild(textEditorStyle);
    }
  }

  function handleEditorMouseMove(e) {
    if (!isEditorActive || selectedElementRef) {
      return;
    }

    const target = e.target;
    if (
      !target ||
      target === document.body ||
      target === document.documentElement
    ) {
      return;
    }

    // Only handle elements with plain text content
    if (!hasPlainTextContent(target) && !isImageElement(target)) {
      return;
    }

    const targetElement = hasPlainTextContent(target) ? target : getImageElement(target)

    // Skip hover effects on persistently selected elements
    if (targetElement === selectedElementRef) {
      if (currentHighlight && currentHighlight !== selectedElementRef) {
        currentHighlight.classList.remove("editor-highlight");
      }
      currentHighlight = null;
      return;
    }

    // Remove previous highlight (but not from selected element)
    if (currentHighlight && currentHighlight !== selectedElementRef) {
      currentHighlight.classList.remove("editor-highlight");
      currentHighlight.removeAttribute("id");
    }

    // Add highlight to current element
    targetElement.classList.add("editor-highlight");
    currentHighlight = targetElement;
  }

  function handleEditorClick(e) {
    if (!isEditorActive) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    const targetElement = hasPlainTextContent(target) ? target : getImageElement(target)
    if (targetElement.id === "edited-element") {
      // Clear previous selection if selecting a different element
      if (selectedElementRef && selectedElementRef !== targetElement) {
        selectedElementRef.classList.remove("editor-highlight");
        selectedElementRef.removeAttribute("id");
      }

      // Also clear any current highlight that might be lingering
      if (currentHighlight && currentHighlight !== targetElement) {
        currentHighlight.classList.remove("editor-highlight");
        currentHighlight.removeAttribute("id");
      }

      if (isImageElement(selectedElementRef)) {
        window.parent.postMessage(
          {
            type: "CLOSE_IMAGE_EDITOR",
          },
          "*"
        );
        selectedElementRef = null;
        return;
      }

      window.parent.postMessage(
        {
          type: "TEXT_EDITOR_CLOSE",
        },
        "*"
      );

      if (originalComponentData) {
        updateOriginalElement(
          selectedElementRef,
          originalComponentData,
          selectedElementRef.value !== "" &&
            originalComponentData &&
            selectedElementRef.value !== originalComponentData.textContent
        );
      }

      return;
    }

    if (
      !targetElement ||
      targetElement === document.body ||
      targetElement === document.documentElement
    ) {
      return;
    }

    ensureEditorStyles();

    // Store selected element for persistence
    selectedElementRef = targetElement;
    targetElement.classList.add("editor-highlight");
    targetElement.id = "edited-element";

    const elementInfo = createElementInfo(targetElement);

    // Check if the selected element is eligible for image editing
    if (isImageElement(targetElement)) {
      const imageInfo = getImageInfo(targetElement);

      // Send OPEN_IMAGE_EDITOR message with element info and image details
      window.parent.postMessage(
        {
          type: "OPEN_IMAGE_EDITOR",
          elementInfo: {
            ...elementInfo,
            imageInfo,
          },
        },
        "*"
      );

      return;
    }

    // Send message to parent
    window.parent.postMessage(
      {
        type: "OPEN_TEXT_EDITOR",
        elementInfo,
      },
      "*"
    );
  }

  function setEditorActive(active) {
    isEditorActive = active;

    if (active) {
      ensureEditorStyles();
      document.body.classList.add("text-editor-active");

      // Add event listeners
      document.addEventListener("mousemove", handleEditorMouseMove, true);
      document.addEventListener("click", handleEditorClick, true);
      document.addEventListener("mouseleave", handleMouseLeave, true);
    } else {
      document.body.classList.remove("text-editor-active");

      // Remove hover highlights but keep selected element highlighted
      if (currentHighlight && currentHighlight !== selectedElementRef) {
        currentHighlight.classList.remove("editor-highlight");
      }
      currentHighlight = null;

      // Remove event listeners
      document.removeEventListener("mousemove", handleEditorMouseMove, true);
      document.removeEventListener("click", handleEditorClick, true);
      document.removeEventListener("mouseleave", handleMouseLeave, true);

      if (selectedElementRef && originalComponentData) {
        updateOriginalElement(
          selectedElementRef,
          originalComponentData,
          selectedElementRef.value !== "" &&
            originalComponentData &&
            selectedElementRef.value !== originalComponentData.textContent
        );
      }

      // Only remove styles if text-editor is off AND no element is selected
      if (!selectedElementRef && textEditorStyle) {
        textEditorStyle.remove();
        textEditorStyle = null;
      }
    }
  }

  // ============================================================================
  // EVENT HANDLERS AND MESSAGE LISTENERS
  // ============================================================================

  // Global keyboard event handler
  window.addEventListener("keydown", (e) => {
    if (
      (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) &&
      isEditorActive
    ) {
      e.preventDefault();

      if (selectedElementRef && originalComponentData) {
        window.parent.postMessage(
          {
            type: "TEXT_EDITOR_CLOSE",
          },
          "*"
        );

        // Restore original element with updated text
        updateOriginalElement(selectedElementRef, originalComponentData, true);
      }

      if (selectedElementRef && isImageElement(selectedElementRef)) {
        window.parent.postMessage(
          {
            type: "CLOSE_IMAGE_EDITOR",
          },
          "*"
        );
      }
    }
  });

  // Listen for messages from parent
  window.addEventListener("message", (event) => {
    switch (event.data.type) {
      case "INSPECTOR_ACTIVATE": {
        setInspectorActive(event.data.active);
        break;
      }
      case "INSPECTOR_CLEAR_SELECTION": {
        if (selectedElementRef) {
          selectedElementRef.classList.remove("inspector-highlight");
          selectedElementRef = null;

          if (!isInspectorActive && inspectorStyle) {
            inspectorStyle.remove();
            inspectorStyle = null;
          }
        }
        break;
      }
      case "EDITOR_ACTIVATE": {
        setEditorActive(event.data.active);
        break;
      }
      case "TEXT_EDITOR_CLEAR_SELECTION": {
        if (selectedElementRef) {
          selectedElementRef.classList.remove("editor-highlight");
          selectedElementRef = null;
          originalComponentData = null;

          if (!isEditorActive && textEditorStyle) {
            textEditorStyle.remove();
            textEditorStyle = null;
          }
        }
        break;
      }
      case "DESELECT_ELEMENT": {
        if (selectedElementRef) {
          // If current selection is a textarea, restore it to original element first
          if (selectedElementRef.tagName === "TEXTAREA") {
            const restoredElement = updateOriginalElement(
              selectedElementRef,
              originalComponentData,
              selectedElementRef.value !== "" &&
                originalComponentData &&
                selectedElementRef.value !== originalComponentData.textContent
            );

            // Remove highlight from restored element
            restoredElement.classList.remove("editor-highlight");
            restoredElement.removeAttribute("id");
          } else {
            // Remove highlight from regular element
            selectedElementRef.classList.remove("editor-highlight");
            selectedElementRef.removeAttribute("id");
          }

          // Clear selection references
          selectedElementRef = null;
          originalComponentData = null;

          // Remove styles if text editor is not active
          if (!isEditorActive && textEditorStyle) {
            textEditorStyle.remove();
            textEditorStyle = null;
          }
        }
        break;
      }

      case "ENABLE_TEXT_EDITOR": {
        const element = document.getElementById("edited-element");
        const textarea = replaceWithTextarea(element);

        selectedElementRef = textarea;
        textarea.classList.add("editor-highlight");
        break;
      }

      case "SET_BOLD": {
        if (selectedElementRef) {
          if (event.data.active) {
            selectedElementRef.style.fontWeight = "bold";
          } else {
            selectedElementRef.style.fontWeight = "normal";
          }
        }
        break;
      }

      case "SET_ITALIC": {
        if (selectedElementRef) {
          if (event.data.active) {
            selectedElementRef.style.fontStyle = "italic";
          } else {
            selectedElementRef.style.fontStyle = "normal";
          }
        }
        break;
      }

      case "SET_ALIGNMENT": {
        if (selectedElementRef && event.data.align) {
          selectedElementRef.style.textAlign = event.data.align;
        }
        break;
      }

      case "SET_NUMBERED_LIST": {
        if (selectedElementRef) {
          let currentText = selectedElementRef.value;

          if (isNumberedList(currentText)) {
            // If already numbered list, convert to plain text
            selectedElementRef.value = convertToPlainText(currentText);
          } else {
            // If text is bullet list, first convert to plain text
            if (isBulletList(currentText)) {
              currentText = convertToPlainText(currentText);
            }

            // Convert to numbered list
            selectedElementRef.value = convertToNumberedList(currentText);
          }

          window.parent.postMessage(
            {
              type: "TEXT_EDITOR_TEXT_CHANGE",
              value: selectedElementRef.value,
            },
            "*"
          );

          // Auto-resize textarea after content change
          autoResizeTextarea(selectedElementRef);

          // Focus back to textarea
          selectedElementRef.focus();
        }
        break;
      }

      case "SET_BULLET_LIST": {
        if (selectedElementRef) {
          let currentText = selectedElementRef.value;

          if (isBulletList(currentText)) {
            // If already bullet list, convert to plain text
            selectedElementRef.value = convertToPlainText(currentText);
          } else {
            // If text is numbered list, first convert to plain text
            if (isNumberedList(currentText)) {
              currentText = convertToPlainText(currentText);
            }

            // Convert to bullet list
            selectedElementRef.value = convertToBulletList(currentText);
          }

          window.parent.postMessage(
            {
              type: "TEXT_EDITOR_TEXT_CHANGE",
              value: selectedElementRef.value,
            },
            "*"
          );

          // Auto-resize textarea after content change
          autoResizeTextarea(selectedElementRef);

          // Focus back to textarea
          selectedElementRef.focus();
        }
        break;
      }

      case "TEXT_EDITOR_GENERATE_TEXT": {
        if (selectedElementRef && event.data.content) {
          // Update the textarea value with the generated content
          selectedElementRef.value = event.data.content;

          // Auto-resize textarea after content change
          autoResizeTextarea(selectedElementRef);

          // Focus back to textarea
          selectedElementRef.focus();

          // Notify parent about the text change
          window.parent.postMessage(
            {
              type: "TEXT_EDITOR_TEXT_CHANGE",
              value: event.data.content,
            },
            "*"
          );
        }
        break;
      }

      case "SET_ELEMENT_STYLE": {
        if (selectedElementRef && event.data.style) {
          const style = event.data.style;

          const paragraphStylesToTag = {
            h1: "h1",
            h2: "h2",
            h3: "h3",
            h4: "h4",
            p1: "p",
            p2: "p",
            p3: "p",
            p4: "p",
            code: "code",
          };

          if (paragraphStylesToTag[style] && originalComponentData) {
            originalComponentData.tagName =
              paragraphStylesToTag[style].toUpperCase();
          }

          const paragraphStyles = {
            h1: { fontSize: "3.75rem", fontWeight: "700" },
            h2: { fontSize: "2.25rem", fontWeight: "700" },
            h3: { fontSize: "1.25rem", fontWeight: "600" },
            h4: { fontSize: "1rem", fontWeight: "600" },
            p1: { fontSize: "1.125rem", fontWeight: "600" }, // 18px, semibold
            p2: { fontSize: "1rem", fontWeight: "500" }, // 16px, medium
            p3: { fontSize: "0.875rem", fontWeight: "400" }, // 14px, normal
            p4: { fontSize: "0.75rem", fontWeight: "400" }, // 12px, normal
          };

          if (paragraphStyles[style]) {
            const styles = paragraphStyles[style];
            selectedElementRef.style.fontSize = styles.fontSize;
            selectedElementRef.style.fontWeight = styles.fontWeight;
          }
        }
        break;
      }

      case "TEXT_EDITOR_UPDATE_IMAGE_SOURCE": {
        if (selectedElementRef && event.data.src) {
          const newSrc = event.data.src;

          // Check if it's an img tag
          if (selectedElementRef.tagName.toLowerCase() === "img") {
            selectedElementRef.src = newSrc;
            selectedElementRef.setAttribute("src", newSrc);
          } else {
            // Check if element has background image and update it
            const computedStyles = window.getComputedStyle(selectedElementRef);
            const backgroundImage =
              computedStyles.getPropertyValue("background-image");

            if (
              backgroundImage &&
              backgroundImage !== "none" &&
              backgroundImage.includes("url(")
            ) {
              selectedElementRef.style.backgroundImage = `url("${newSrc}")`;
            }
          }
        }
        break;
      }

      case "TEXT_EDITOR_UPDATE_IMAGE_FIT": {
        if (selectedElementRef && event.data.objectFit) {
          const newObjectFit = event.data.objectFit;

          // Check if it's an img tag
          if (selectedElementRef.tagName.toLowerCase() === "img") {
            selectedElementRef.style.objectFit = newObjectFit;
          } else {
            // For background images, we can update background-size which is similar to object-fit
            const computedStyles = window.getComputedStyle(selectedElementRef);
            const backgroundImage =
              computedStyles.getPropertyValue("background-image");

            if (
              backgroundImage &&
              backgroundImage !== "none" &&
              backgroundImage.includes("url(")
            ) {
              const backgroundSize = newObjectFit;
              selectedElementRef.style.backgroundSize = backgroundSize;

              // Also set background-repeat to no-repeat for better control
              selectedElementRef.style.backgroundRepeat = "no-repeat";
              selectedElementRef.style.backgroundPosition = "center";
            }
          }
        }
        break;
      }

      default: {
        console.log(`Not supported action ${event.data.type}`);
        break;
      }
    }
  });

  // Auto-inject if inspector is already active
  window.parent.postMessage({ type: "EDITOR_TOOLS_READY" }, "*");
})();
