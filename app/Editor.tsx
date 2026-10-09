"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "bloco-links:texto";
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;
const HAS_BODY = /^(?:https?:\/\/|www\.).+/i;

type Leaf = Text | HTMLBRElement;

/** Text and <br> nodes in document order (browsers differ: Chrome puts "\n" in
 *  text nodes, Firefox uses <br>). */
function leaves(root: Node): Leaf[] {
  const out: Leaf[] = [];
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) out.push(c as Text);
      else if (c.nodeName === "BR") out.push(c as HTMLBRElement);
      else walk(c);
    });
  };
  walk(root);
  return out;
}

const textOf = (list: Leaf[]) =>
  list.map((l) => (l.nodeType === Node.TEXT_NODE ? (l as Text).data : "\n")).join("");

/** Editor text. A trailing newline is the browser's caret placeholder for an
 *  empty last line, so it is not part of the content. */
const readText = (root: HTMLElement) => {
  const raw = textOf(leaves(root));
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
};

/** URLs found in a line, trailing punctuation excluded. */
function findUrls(line: string) {
  const found: { start: number; url: string }[] = [];
  for (const m of line.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING_PUNCT, "");
    if (HAS_BODY.test(url)) found.push({ start: m.index ?? 0, url });
  }
  return found;
}

function fill(root: HTMLElement, text: string) {
  root.textContent = "";
  text.split("\n").forEach((line, i) => {
    if (i > 0) root.appendChild(document.createTextNode("\n"));
    let pos = 0;
    for (const { start, url } of findUrls(line)) {
      if (start > pos) root.appendChild(document.createTextNode(line.slice(pos, start)));
      const a = document.createElement("a");
      a.href = /^www\./i.test(url) ? `https://${url}` : url;
      a.textContent = url;
      root.appendChild(a);
      pos = start + url.length;
    }
    if (pos < line.length) root.appendChild(document.createTextNode(line.slice(pos)));
  });
  if (text.endsWith("\n")) root.appendChild(document.createTextNode("\n"));
}

function getCaret(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(range.endContainer, range.endOffset);
  const box = document.createElement("div");
  box.appendChild(before.cloneContents());
  return textOf(leaves(box)).length;
}

function setCaret(root: HTMLElement, target: number) {
  const range = document.createRange();
  let left = target;
  let placed = false;
  for (const leaf of leaves(root)) {
    if (leaf.nodeType === Node.TEXT_NODE) {
      const len = (leaf as Text).data.length;
      const insideLink = leaf.parentNode?.nodeName === "A";
      // Never park the caret at the end of a link, or typing would extend it.
      if (left < len || (left === len && !insideLink)) {
        range.setStart(leaf, left);
        placed = true;
        break;
      }
      left -= len;
    } else {
      if (left === 0) {
        range.setStartBefore(leaf);
        placed = true;
        break;
      }
      left -= 1;
    }
  }
  if (!placed) range.setStart(root, root.childNodes.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Re-render with links, only if the set of links is out of date. */
function relink(root: HTMLElement, caret: number | null) {
  const text = readText(root);
  const expected = text.split("\n").flatMap((l) => findUrls(l).map((u) => u.url));
  const current = Array.from(root.querySelectorAll("a")).map((a) => a.textContent);
  if (expected.length === current.length && expected.every((u, i) => u === current[i])) return;
  fill(root, text);
  if (caret !== null) setCaret(root, caret);
}

function save(root: HTMLElement) {
  try {
    localStorage.setItem(STORAGE_KEY, readText(root));
  } catch {}
}

export default function Editor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    try {
      fill(root, localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {}
    if (window.matchMedia("(pointer: fine)").matches) root.focus();

    // Native listener: React's onBeforeInput is synthetic and has no inputType.
    // Keep lines as plain <br>, never <div>/<p> blocks.
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === "insertParagraph") {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    };
    root.addEventListener("beforeinput", onBeforeInput);
    return () => root.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  const afterEdit = () => {
    const root = ref.current;
    if (!root) return;
    const text = readText(root);
    if (text === "") root.textContent = "";
    save(root);
    const caret = getCaret(root);
    if (caret !== null && /\s/.test(text[caret - 1] ?? "")) relink(root, caret);
  };

  return (
    <div
      ref={ref}
      className="editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      autoCapitalize="off"
      role="textbox"
      aria-multiline="true"
      aria-label="Bloco de links"
      data-placeholder="Cole um link e dê espaço…"
      onInput={(e) => {
        if (!(e.nativeEvent as InputEvent).isComposing) afterEdit();
      }}
      onCompositionEnd={afterEdit}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        text.split("\n").forEach((line, i) => {
          if (i > 0) document.execCommand("insertLineBreak");
          if (line) document.execCommand("insertText", false, line);
        });
        // Pasting a bare link: add the space so it turns into a link right away.
        if (/(?:https?:\/\/|www\.)\S+$/i.test(text)) document.execCommand("insertText", false, " ");
      }}
      onBlur={() => {
        const root = ref.current;
        if (root) {
          relink(root, null);
          save(root);
        }
      }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        e.preventDefault();
        // Same tab on purpose: in-app browsers (like Rave's) often ignore target=_blank.
        window.location.assign(a.href);
      }}
    />
  );
}
