import { Extension } from "@tiptap/core";
import { EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import {
  ReplaceStep,
  ReplaceAroundStep,
  AddMarkStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  AttrStep,
} from "@tiptap/pm/transform";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import {
  deepEqualIterative,
  footerClickEvent,
  getCustomPages,
  getFooter,
  getFooterHeight,
  getHeader,
  getHeaderHeight,
  getHeight,
  headerClickEvent,
  updateCssVariables,
} from "./utils";
import { PageSize } from "./constants";
import {
  HeaderOptions,
  FooterOptions,
  PageNumber,
  HeaderHeightMap,
  FooterHeightMap,
  HeaderClickEvent,
  FooterClickEvent,
} from "./types";
import type { Node as PMNode } from "prosemirror-model";

export interface PaginationPlusOptions {
  pageHeight: number;
  pageWidth: number;
  pageGap: number;
  pageBreakBackground: string;
  pageGapBorderSize: number;
  footerRight: string;
  footerLeft: string;
  footerCenter: string;
  headerRight: string;
  headerLeft: string;
  headerCenter: string;
  customHeader: Record<PageNumber, HeaderOptions>;
  customFooter: Record<PageNumber, FooterOptions>;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  contentMarginTop: number;
  contentMarginBottom: number;
  pageGapBorderColor: string;
  onHeaderClick?: HeaderClickEvent;
  onFooterClick?: FooterClickEvent;
}

export interface PaginationPlusStorage extends PaginationPlusOptions {
  headerHeight: HeaderHeightMap;
  footerHeight: FooterHeightMap;
  lastPageCount: number;
}

// ============================================================================
// HARD LIMITS - These cannot be exceeded
// ============================================================================
const MAX_PAGES = 20; // Hard cap - no document should have more than this during editing
const MAX_UPDATES_PER_CYCLE = 5; // Max updates before we stop

// Global state on window to persist across everything
declare global {
  interface Window {
    __pp_state?: {
      updateCount: number;
      lastUpdateTime: number;
      locked: boolean;
      currentPageCount: number;
    };
  }
}

function getState() {
  if (!window.__pp_state) {
    window.__pp_state = {
      updateCount: 0,
      lastUpdateTime: 0,
      locked: false,
      currentPageCount: 1,
    };
  }
  return window.__pp_state;
}

function resetState() {
  console.log("🔄 PP: Resetting state");
  window.__pp_state = {
    updateCount: 0,
    lastUpdateTime: Date.now(),
    locked: false,
    currentPageCount: 1,
  };
}

// ============================================================================

const page_count_meta_key = "PAGE_COUNT_META_KEY";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    PaginationPlus: {
      updatePageBreakBackground: (color: string) => ReturnType;
      updatePageSize: (size: PageSize) => ReturnType;
      updatePageHeight: (height: number) => ReturnType;
      updatePageWidth: (width: number) => ReturnType;
      updatePageGap: (gap: number) => ReturnType;
      updateMargins: (margins: {
        top: number;
        bottom: number;
        left: number;
        right: number;
      }) => ReturnType;
      updateContentMargins: (margins: {
        top: number;
        bottom: number;
      }) => ReturnType;
      updateHeaderContent: (
        left: string,
        right: string,
        center?: string,
        pageNumber?: PageNumber
      ) => ReturnType;
      updateFooterContent: (
        left: string,
        right: string,
        center?: string,
        pageNumber?: PageNumber
      ) => ReturnType;
    };
  }
  interface Storage {
    PaginationPlus: PaginationPlusStorage;
  }
}

const key = new PluginKey<DecorationSet>("brDecoration");

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "hardBreak") {
      const afterPos = pos + 1;
      const widget = Decoration.widget(afterPos, () => {
        const el = document.createElement("span");
        el.classList.add("rm-br-decoration");
        return el;
      });
      decorations.push(widget);
    }
  });
  return DecorationSet.create(doc, decorations);
}

const defaultOptions: PaginationPlusOptions = {
  pageHeight: 800,
  pageWidth: 789,
  pageGap: 50,
  pageGapBorderSize: 1,
  pageBreakBackground: "#ffffff",
  footerRight: "{page}",
  footerLeft: "",
  footerCenter: "",
  headerRight: "",
  headerLeft: "",
  headerCenter: "",
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 50,
  marginRight: 50,
  contentMarginTop: 10,
  contentMarginBottom: 10,
  pageGapBorderColor: "#e5e5e5",
  customHeader: {},
  customFooter: {},
};

const refreshPage = (targetNode: HTMLElement) => {
  const paginationElement = targetNode.querySelector("[data-rm-pagination]");
  if (paginationElement) {
    const lastPageBreak = paginationElement.lastElementChild?.querySelector(
      ".breaker"
    ) as HTMLElement;
    if (lastPageBreak) {
      const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight;
      targetNode.style.minHeight = `calc(${minHeight}px + 2px)`;
    }
  }
};

const paginationKey = new PluginKey("pagination");

// ============================================================================
// SIMPLE PAGE CALCULATION - No recursion, hard capped
// ============================================================================
function simpleCalculatePageCount(
  editorDom: HTMLElement,
  pageOptions: PaginationPlusOptions
): number {
  const state = getState();

  // If locked, return current count
  if (state.locked) {
    console.log("🔒 PP: Locked, returning", state.currentPageCount);
    return state.currentPageCount;
  }

  // Increment update count
  state.updateCount++;

  // If too many updates, lock and return
  if (state.updateCount > MAX_UPDATES_PER_CYCLE) {
    console.warn("⚠️ PP: Too many updates, locking at", state.currentPageCount);
    state.locked = true;
    // Auto-unlock after 2 seconds
    setTimeout(() => {
      console.log("🔓 PP: Auto-unlocking");
      state.locked = false;
      state.updateCount = 0;
    }, 2000);
    return state.currentPageCount;
  }

  // Calculate available content height per page
  const margins =
    pageOptions.marginTop +
    pageOptions.marginBottom +
    pageOptions.contentMarginTop +
    pageOptions.contentMarginBottom;
  const contentHeightPerPage = pageOptions.pageHeight - margins;

  console.log("📏 PP: Calculating pages", {
    pageHeight: pageOptions.pageHeight,
    pageWidth: pageOptions.pageWidth,
    margins,
    contentHeightPerPage,
    updateCount: state.updateCount,
  });

  if (contentHeightPerPage <= 50) {
    console.error("❌ PP: Content height too small:", contentHeightPerPage);
    state.currentPageCount = 1;
    return 1;
  }

  // Get actual content height (excluding pagination elements)
  let contentHeight = 0;
  const children = editorDom.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement;
    // Skip pagination wrapper
    if (
      child.id === "pages" ||
      child.classList.contains("rm-pages-wrapper") ||
      child.classList.contains("rm-first-page-header")
    ) {
      continue;
    }
    contentHeight += child.offsetHeight;
  }

  console.log("📐 PP: Content measurement", {
    contentHeight,
    childCount: children.length,
  });

  // Simple calculation
  let pageCount = Math.ceil(contentHeight / contentHeightPerPage);
  pageCount = Math.max(1, pageCount);

  // HARD CAP
  if (pageCount > MAX_PAGES) {
    console.warn(`⚠️ PP: Capping pages from ${pageCount} to ${MAX_PAGES}`);
    pageCount = MAX_PAGES;
  }

  console.log("📄 PP: Final page count:", pageCount);
  state.currentPageCount = pageCount;
  return pageCount;
}

// ============================================================================

export const PaginationPlus = Extension.create<
  PaginationPlusOptions,
  PaginationPlusStorage
>({
  name: "PaginationPlus",
  addOptions() {
    return defaultOptions;
  },
  addStorage() {
    return {
      ...defaultOptions,
      headerHeight: new Map(),
      footerHeight: new Map(),
      lastPageCount: 0,
    };
  },
  onCreate() {
    console.log("🚀 PP: Extension created", {
      pageWidth: this.options.pageWidth,
      pageHeight: this.options.pageHeight,
    });

    resetState();

    const targetNode = this.editor.view.dom;
    targetNode.classList.add("rm-with-pagination");
    targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`;
    targetNode.style.paddingLeft = `var(--rm-margin-left)`;
    targetNode.style.paddingRight = `var(--rm-margin-right)`;
    targetNode.style.width = `var(--rm-page-width)`;

    updateCssVariables(targetNode, this.options);

    // Add styles
    const existingStyle = document.querySelector("[data-rm-pagination-style]");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.dataset.rmPaginationStyle = "";
    style.textContent = `
      .rm-pagination-gap{
        border-top: 1px solid;
        border-bottom: 1px solid;
        border-color: var(--rm-page-gap-border-color);
      }
      .rm-with-pagination,
      .rm-with-pagination .rm-first-page-header {
        counter-reset: page-number page-number-plus 1;
      }
      .rm-with-pagination .image-plus-wrapper,
      .rm-with-pagination .table-plus td,
      .rm-with-pagination .table-plus th {
        max-height: var(--rm-max-content-child-height);
        overflow-y: auto;
      }
      .rm-with-pagination .image-plus-wrapper {
        overflow-y: visible;
      }
      .rm-with-pagination .rm-page-break {
        counter-increment: page-number page-number-plus;
      }
      .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap {
        display: none;
      }
      .rm-with-pagination .rm-page-break:last-child .rm-page-header {
        display: none;
      }
      .rm-with-pagination table tr td,
      .rm-with-pagination table tr th {
        word-break: break-all;
      }
      .rm-with-pagination table > tr {
        display: grid;
        min-width: 100%;
      }
      .rm-with-pagination table {
        border-collapse: collapse;
        width: 100%;
        display: contents;
      }
      .rm-with-pagination table tbody{
        display: table;
        max-height: 300px;
        overflow-y: auto;
      }
      .rm-with-pagination table tbody > tr{
        display: table-row !important;
      }
      .rm-with-pagination *:has(>br.ProseMirror-trailingBreak:only-child) {
        display: table;
        width: 100%;
      }
      .rm-with-pagination .rm-br-decoration {
        display: table;
        width: 100%;
      }
      .rm-with-pagination .table-row-group {
        max-height: var(--rm-max-content-child-height);
        overflow-y: auto;
        width: 100%;
      }
      .rm-with-pagination .rm-page-footer-left,
      .rm-with-pagination .rm-page-footer-right,
      .rm-with-pagination .rm-page-footer-center,
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-header-right,
      .rm-with-pagination .rm-page-header-center {
        display: inline-block;
      }
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-footer-left{
        float: left;
        margin-left: var(--rm-margin-left);
      }
      .rm-with-pagination .rm-page-header-right,
      .rm-with-pagination .rm-page-footer-right{
        float: right;
        margin-right: var(--rm-margin-right);
      }
      .rm-with-pagination .rm-page-header-center,
      .rm-with-pagination .rm-page-footer-center{
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
      }
      .rm-with-pagination .rm-first-page-header .rm-page-header-right{
        margin-right: 0px !important;
      }
      .rm-with-pagination .rm-first-page-header .rm-page-header-left{
        margin-left: 0px !important;
      }
      .rm-with-pagination .rm-page-number::before {
        content: counter(page-number);
      }
      .rm-with-pagination .rm-page-number-plus::before {
        content: counter(page-number-plus);
      }
      .rm-with-pagination .rm-page-header,
      .rm-with-pagination .rm-page-footer{
        width: 100%;
      }
      .rm-with-pagination .rm-page-header{
        padding-bottom: var(--rm-content-margin-top) !important;
        padding-top: var(--rm-margin-top) !important;
        display: inline-flex;
        justify-content: space-between;
        max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-margin-top) - var(--rm-content-margin-top));
        overflow-y: hidden;
        position: relative;
      }
      .rm-with-pagination .rm-page-footer{
        padding-top: var(--rm-content-margin-bottom) !important;
        padding-bottom: var(--rm-margin-bottom) !important;
        display: inline-flex;
        justify-content: space-between;
        max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-content-margin-bottom) - var(--rm-margin-bottom));
        overflow-y: hidden;
        position: relative;
      }
    `;
    document.head.appendChild(style);
    refreshPage(targetNode);
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const extensionThis = this;

    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: (_, state) => {
            console.log("🔌 PP: Plugin init");
            const widgetList = createDecoration(
              extensionThis.options,
              new Map(),
              new Map(),
              1
            );
            extensionThis.storage = {
              ...extensionThis.options,
              headerHeight: new Map(),
              footerHeight: new Map(),
              lastPageCount: 1,
            };
            return {
              decorations: DecorationSet.create(state.doc, widgetList),
            };
          },
          apply: (tr, oldDeco, oldState, newState) => {
            const ppState = getState();

            // If locked, don't change anything
            if (ppState.locked) {
              return oldDeco;
            }

            const currentPageCount = getExistingPageCount(editor.view);
            const pageCount = simpleCalculatePageCount(
              editor.view.dom,
              extensionThis.options
            );

            const needsUpdate =
              pageCount !== currentPageCount ||
              extensionThis.storage.pageHeight !==
                extensionThis.options.pageHeight ||
              extensionThis.storage.pageWidth !==
                extensionThis.options.pageWidth ||
              extensionThis.storage.marginTop !==
                extensionThis.options.marginTop ||
              extensionThis.storage.marginBottom !==
                extensionThis.options.marginBottom;

            if (needsUpdate) {
              console.log("🔄 PP: Updating decorations", {
                from: currentPageCount,
                to: pageCount,
                reason:
                  extensionThis.storage.pageHeight !==
                  extensionThis.options.pageHeight
                    ? "pageHeight changed"
                    : "pageCount changed",
              });

              updateCssVariables(editor.view.dom, extensionThis.options);

              const widgetList = createDecoration(
                extensionThis.options,
                extensionThis.storage.headerHeight || new Map(),
                extensionThis.storage.footerHeight || new Map(),
                pageCount
              );

              extensionThis.storage = {
                ...extensionThis.options,
                headerHeight: extensionThis.storage.headerHeight || new Map(),
                footerHeight: extensionThis.storage.footerHeight || new Map(),
                lastPageCount: pageCount,
              };

              return {
                decorations: DecorationSet.create(newState.doc, widgetList),
              };
            }

            return oldDeco;
          },
        },
        props: {
          decorations(state: EditorState) {
            return this.getState(state)?.decorations as DecorationSet;
          },
        },
        view: (editorView: EditorView) => {
          console.log("👁️ PP: View created");
          return {
            update: (view: EditorView) => {
              const ppState = getState();

              if (ppState.locked) {
                return;
              }

              const currentPageCount = getExistingPageCount(view);
              const pageCount = simpleCalculatePageCount(
                view.dom,
                extensionThis.options
              );

              if (currentPageCount !== pageCount) {
                console.log("📊 PP: View update - page count mismatch", {
                  current: currentPageCount,
                  calculated: pageCount,
                });

                requestAnimationFrame(() => {
                  if (!ppState.locked) {
                    const tr = view.state.tr.setMeta(page_count_meta_key, {});
                    view.dispatch(tr);
                  }
                });
                return;
              }

              // Reset update count when stable
              if (ppState.updateCount > 0) {
                console.log("✅ PP: Stable at", currentPageCount, "pages");
                ppState.updateCount = 0;
              }

              refreshPage(view.dom);
            },
          };
        },
      }),
      new Plugin<DecorationSet>({
        key,
        state: {
          init(_, state) {
            return buildDecorations(state.doc);
          },
          apply(tr, old) {
            if (getState().locked) return old;
            if (tr.docChanged) {
              return buildDecorations(tr.doc);
            }
            return old;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
  addCommands() {
    return {
      updatePageBreakBackground: (color: string) => () => {
        this.options.pageBreakBackground = color;
        return true;
      },
      updatePageSize: (size: PageSize) => () => {
        console.log("📐 PP: updatePageSize command", size);
        resetState();
        this.options.pageHeight = size.pageHeight;
        this.options.pageWidth = size.pageWidth;
        this.options.marginTop = size.marginTop;
        this.options.marginBottom = size.marginBottom;
        this.options.marginLeft = size.marginLeft;
        this.options.marginRight = size.marginRight;
        return true;
      },
      updatePageWidth: (width: number) => () => {
        resetState();
        this.options.pageWidth = width;
        return true;
      },
      updatePageHeight: (height: number) => () => {
        resetState();
        this.options.pageHeight = height;
        return true;
      },
      updatePageGap: (gap: number) => () => {
        this.options.pageGap = gap;
        return true;
      },
      updateMargins:
        (margins: {
          top: number;
          bottom: number;
          left: number;
          right: number;
        }) =>
        () => {
          resetState();
          this.options.marginTop = margins.top;
          this.options.marginBottom = margins.bottom;
          this.options.marginLeft = margins.left;
          this.options.marginRight = margins.right;
          return true;
        },
      updateContentMargins:
        (margins: { top: number; bottom: number }) => () => {
          this.options.contentMarginTop = margins.top;
          this.options.contentMarginBottom = margins.bottom;
          return true;
        },
      updateHeaderContent:
        (
          left: string,
          right: string,
          center?: string,
          pageNumber?: PageNumber
        ) =>
        () => {
          if (pageNumber) {
            this.options.customHeader = {
              ...this.options.customHeader,
              [pageNumber]: {
                headerLeft: left,
                headerRight: right,
                headerCenter: center || "",
              },
            };
          } else {
            this.options.headerLeft = left;
            this.options.headerRight = right;
            this.options.headerCenter = center || "";
          }
          return true;
        },
      updateFooterContent:
        (
          left: string,
          right: string,
          center?: string,
          pageNumber?: PageNumber
        ) =>
        () => {
          if (pageNumber) {
            this.options.customFooter = {
              ...this.options.customFooter,
              [pageNumber]: {
                footerLeft: left,
                footerRight: right,
                footerCenter: center || "",
              },
            };
          } else {
            this.options.footerLeft = left;
            this.options.footerRight = right;
            this.options.footerCenter = center || "";
          }
          return true;
        },
    };
  },
});

const getExistingPageCount = (view: EditorView) => {
  const editorDom = view.dom;
  const paginationElement = editorDom.querySelector("[data-rm-pagination]");
  if (paginationElement) {
    return paginationElement.children.length;
  }
  return 0;
};

function createDecoration(
  pageOptions: PaginationPlusOptions,
  headerHeightMap: HeaderHeightMap,
  footerHeightMap: FooterHeightMap,
  pageCount: number
): Decoration[] {
  console.log("🎨 PP: Creating decorations for", pageCount, "pages");

  // HARD CAP
  const safePageCount = Math.min(pageCount, MAX_PAGES);
  if (pageCount > MAX_PAGES) {
    console.warn(
      `⚠️ PP: createDecoration capping from ${pageCount} to ${safePageCount}`
    );
  }

  const commonHeaderOptions: HeaderOptions = {
    headerLeft: pageOptions.headerLeft,
    headerRight: pageOptions.headerRight,
    headerCenter: pageOptions.headerCenter || "",
  };
  const commonFooterOptions: FooterOptions = {
    footerLeft: pageOptions.footerLeft,
    footerRight: pageOptions.footerRight,
    footerCenter: pageOptions.footerCenter || "",
  };

  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _pageGap = pageOptions.pageGap;
      const _pageBreakBackground = pageOptions.pageBreakBackground;

      const el = document.createElement("div");
      el.dataset.rmPagination = "true";

      const pageBreakDefinition = (
        firstPage: boolean,
        pageHeader: HTMLElement,
        pageFooter: HTMLElement,
        headerHeight: number,
        footerHeight: number,
        pageNumber?: PageNumber
      ) => {
        const { _pageHeaderHeight, _pageHeight } = getHeight(
          pageOptions,
          headerHeight,
          footerHeight
        );

        const pageContainer = document.createElement("div");
        pageContainer.classList.add("rm-page-break");

        const page = document.createElement("div");
        page.classList.add("page");
        page.style.position = "relative";
        page.style.float = "left";
        page.style.clear = "both";
        const marginTop = firstPage
          ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
          : _pageHeight + "px";
        if (pageNumber) {
          page.style.marginTop = `var(--rm-page-content-${pageNumber}, ${marginTop})`;
        } else {
          page.style.marginTop = firstPage
            ? `var(--rm-page-content-first, ${marginTop})`
            : `var(--rm-page-content-general, ${marginTop})`;
        }

        const pageBreak = document.createElement("div");
        pageBreak.classList.add("breaker");
        pageBreak.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`;
        pageBreak.style.marginLeft = `calc(-1 * var(--rm-margin-left))`;
        pageBreak.style.marginRight = `calc(-1 * var(--rm-margin-right))`;
        pageBreak.style.position = "relative";
        pageBreak.style.float = "left";
        pageBreak.style.clear = "both";
        pageBreak.style.left = "0px";
        pageBreak.style.right = "0px";
        pageBreak.style.zIndex = "2";

        const pageSpace = document.createElement("div");
        pageSpace.classList.add("rm-pagination-gap");
        pageSpace.style.height = _pageGap + "px";
        pageSpace.style.borderLeft = "1px solid";
        pageSpace.style.borderRight = "1px solid";
        pageSpace.style.position = "relative";
        pageSpace.style.setProperty("width", "calc(100% + 2px)", "important");
        pageSpace.style.left = "-1px";
        pageSpace.style.backgroundColor = _pageBreakBackground;
        pageSpace.style.borderLeftColor = _pageBreakBackground;
        pageSpace.style.borderRightColor = _pageBreakBackground;

        pageBreak.append(pageFooter, pageSpace, pageHeader);
        pageContainer.append(page, pageBreak);

        return pageContainer;
      };

      const _headerHeight = headerHeightMap.get(0) || 0;
      const _footerHeight = footerHeightMap.get(0) || 0;

      const fragment = document.createDocumentFragment();

      // Use safe page count
      for (let i = 0; i < safePageCount; i++) {
        const pageNumber = i + 1;
        const headerPageNumber = i + 2;

        const __pageHeader = getHeader(
          commonHeaderOptions.headerRight,
          commonHeaderOptions.headerLeft,
          commonHeaderOptions.headerCenter || "",
          headerClickEvent(headerPageNumber, pageOptions.onHeaderClick)
        );
        const __pageFooter = getFooter(
          commonFooterOptions.footerRight,
          commonFooterOptions.footerLeft,
          commonFooterOptions.footerCenter || "",
          footerClickEvent(pageNumber, pageOptions.onFooterClick)
        );
        fragment.appendChild(
          pageBreakDefinition(
            i === 0,
            __pageHeader,
            __pageFooter,
            _headerHeight,
            _footerHeight
          )
        );
      }

      el.append(fragment);
      el.id = "pages";
      el.classList.add("rm-pages-wrapper");

      return el;
    },
    { side: -1 }
  );

  const firstHeaderWidget = Decoration.widget(
    0,
    () => {
      let _headerOptions: HeaderOptions = { ...commonHeaderOptions };
      if (1 in pageOptions.customHeader) {
        _headerOptions = pageOptions.customHeader[1];
      }
      const el = getHeader(
        _headerOptions.headerRight,
        _headerOptions.headerLeft,
        _headerOptions.headerCenter || "",
        headerClickEvent(1, pageOptions.onHeaderClick)
      );
      el.classList.add("rm-first-page-header");
      return el;
    },
    { side: -1 }
  );

  return [pageWidget, firstHeaderWidget];
}
