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

const page_count_meta_key = "PAGE_COUNT_META_KEY";

// ============================================================================
// DEBUG: Global state for tracking
// ============================================================================
declare global {
  interface Window {
    __paginationDebug?: {
      callCount: number;
      lastCalculatedPageCount: number;
      lastDimensions: { width: number; height: number };
      history: Array<{
        timestamp: number;
        action: string;
        pageCount: number;
        details: any;
      }>;
    };
  }
}

function getDebugState() {
  if (!window.__paginationDebug) {
    window.__paginationDebug = {
      callCount: 0,
      lastCalculatedPageCount: 1,
      lastDimensions: { width: 0, height: 0 },
      history: [],
    };
  }
  return window.__paginationDebug;
}

function logDebug(action: string, pageCount: number, details: any = {}) {
  const state = getDebugState();
  state.callCount++;
  state.history.push({
    timestamp: Date.now(),
    action,
    pageCount,
    details,
  });

  // Keep only last 50 entries
  if (state.history.length > 50) {
    state.history.shift();
  }

  console.log(`🔍 [${state.callCount}] ${action}:`, {
    pageCount,
    ...details,
  });
}

function resetDebugState() {
  window.__paginationDebug = {
    callCount: 0,
    lastCalculatedPageCount: 1,
    lastDimensions: { width: 0, height: 0 },
    history: [],
  };
  console.log("🔄 Debug state reset");
}

// ============================================================================

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
// DEBUG VERSION: calculatePageCount with extensive logging
// ============================================================================
const calculatePageCount = (
  view: EditorView,
  pageOptions: PaginationPlusOptions,
  headerHeight: number = 0,
  footerHeight: number = 0
) => {
  const debugState = getDebugState();
  const editorDom = view.dom;

  // Calculate page content area
  const _pageHeaderHeight =
    pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
  const _pageFooterHeight =
    pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
  const pageContentAreaHeight =
    pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;

  logDebug("calculatePageCount START", 0, {
    pageHeight: pageOptions.pageHeight,
    pageWidth: pageOptions.pageWidth,
    _pageHeaderHeight,
    _pageFooterHeight,
    pageContentAreaHeight,
    marginTop: pageOptions.marginTop,
    marginBottom: pageOptions.marginBottom,
  });

  if (pageContentAreaHeight <= 50) {
    console.error("❌ Page content area too small:", pageContentAreaHeight);
    return 1;
  }

  const paginationElement = editorDom.querySelector("[data-rm-pagination]");
  const currentPageCount = paginationElement
    ? paginationElement.children.length
    : 0;

  logDebug("Current state", currentPageCount, {
    hasPaginationElement: !!paginationElement,
    currentPageCount,
  });

  if (paginationElement) {
    const lastElementOfEditor = editorDom.lastElementChild;
    const lastPageBreak =
      paginationElement.lastElementChild?.querySelector(".breaker");

    if (lastElementOfEditor && lastPageBreak) {
      const lastElementRect = lastElementOfEditor.getBoundingClientRect();
      const lastPageBreakRect = lastPageBreak.getBoundingClientRect();
      const lastPageGap = lastElementRect.bottom - lastPageBreakRect.bottom;

      logDebug("Measuring overflow", currentPageCount, {
        lastElementBottom: lastElementRect.bottom,
        lastPageBreakBottom: lastPageBreakRect.bottom,
        lastPageGap,
        editorScrollHeight: editorDom.scrollHeight,
        editorClientHeight: editorDom.clientHeight,
      });

      if (lastPageGap > 0) {
        // Content overflows - need more pages
        const addPage = Math.ceil(lastPageGap / pageContentAreaHeight);
        const newPageCount = currentPageCount + addPage;

        logDebug("OVERFLOW - Adding pages", newPageCount, {
          overflow: lastPageGap,
          addPage,
          calculation: `${currentPageCount} + ${addPage} = ${newPageCount}`,
        });

        return newPageCount;
      } else {
        // Content fits or has extra space
        const lpFrom = -10;
        const lpTo = -(pageOptions.pageHeight - 10);

        logDebug("Content fits check", currentPageCount, {
          lastPageGap,
          lpFrom,
          lpTo,
          inRange: lastPageGap > lpTo && lastPageGap < lpFrom,
          shouldRemove: lastPageGap < lpTo,
        });

        if (lastPageGap > lpTo && lastPageGap < lpFrom) {
          // Content fits properly
          logDebug("STABLE - Content fits", currentPageCount, {});
          return currentPageCount;
        } else if (lastPageGap < lpTo) {
          // Too much empty space - remove pages
          const pageHeightOnRemove =
            pageOptions.pageHeight + pageOptions.pageGap;
          const removePage = Math.floor(lastPageGap / pageHeightOnRemove);
          const newPageCount = Math.max(1, currentPageCount + removePage);

          logDebug("EXCESS SPACE - Removing pages", newPageCount, {
            emptySpace: Math.abs(lastPageGap),
            removePage,
            calculation: `${currentPageCount} + ${removePage} = ${newPageCount}`,
          });

          return newPageCount;
        } else {
          logDebug("STABLE - Within tolerance", currentPageCount, {});
          return currentPageCount;
        }
      }
    }

    logDebug("No last element or page break", 1, {});
    return 1;
  } else {
    // No pagination element yet - estimate
    const editorHeight = editorDom.scrollHeight;
    let pageCount = Math.ceil(editorHeight / pageContentAreaHeight);
    pageCount = pageCount <= 0 ? 1 : pageCount;

    logDebug("INITIAL - No pagination element", pageCount, {
      editorHeight,
      pageContentAreaHeight,
      calculation: `ceil(${editorHeight} / ${pageContentAreaHeight}) = ${pageCount}`,
    });

    return pageCount;
  }
};

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
    console.log("🚀 PaginationPlus onCreate called");
    resetDebugState();

    const targetNode = this.editor.view.dom;
    targetNode.classList.add("rm-with-pagination");
    targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`;
    targetNode.style.paddingLeft = `var(--rm-margin-left)`;
    targetNode.style.paddingRight = `var(--rm-margin-right)`;
    targetNode.style.width = `var(--rm-page-width)`;

    updateCssVariables(targetNode, this.options);

    logDebug("onCreate", 0, {
      pageWidth: this.options.pageWidth,
      pageHeight: this.options.pageHeight,
    });

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
            logDebug("Plugin state init", 1, {});

            const widgetList = createDecoration(
              extensionThis.options,
              new Map(),
              new Map()
            );
            extensionThis.storage = {
              ...extensionThis.options,
              headerHeight: new Map(),
              footerHeight: new Map(),
              lastPageCount: 0,
            };

            return {
              decorations: DecorationSet.create(state.doc, widgetList),
            };
          },
          apply: (tr, oldDeco, oldState, newState) => {
            const pageCount = calculatePageCount(
              editor.view,
              extensionThis.options
            );
            const currentPageCount = getExistingPageCount(editor.view);

            logDebug("Plugin state apply", pageCount, {
              calculatedPageCount: pageCount,
              currentPageCount,
              docChanged: tr.docChanged,
              settingsChanged:
                extensionThis.storage.pageHeight !==
                extensionThis.options.pageHeight,
            });

            const getNewDecoration = () => {
              updateCssVariables(editor.view.dom, extensionThis.options);
              let headerHeight =
                "headerHeight" in extensionThis.storage
                  ? extensionThis.storage.headerHeight
                  : new Map();
              let footerHeight =
                "footerHeight" in extensionThis.storage
                  ? extensionThis.storage.footerHeight
                  : new Map();

              const widgetList = createDecoration(
                extensionThis.options,
                headerHeight,
                footerHeight
              );
              extensionThis.storage = {
                ...extensionThis.options,
                headerHeight,
                footerHeight,
                lastPageCount: extensionThis.storage.lastPageCount,
              };
              return {
                decorations: DecorationSet.create(newState.doc, [
                  ...widgetList,
                ]),
                footerHeight,
              };
            };

            if (
              (pageCount > 1 ? pageCount : 1) !== currentPageCount ||
              extensionThis.storage.pageBreakBackground !==
                extensionThis.options.pageBreakBackground ||
              extensionThis.storage.pageHeight !==
                extensionThis.options.pageHeight ||
              extensionThis.storage.pageWidth !==
                extensionThis.options.pageWidth ||
              extensionThis.storage.marginTop !==
                extensionThis.options.marginTop ||
              extensionThis.storage.marginBottom !==
                extensionThis.options.marginBottom ||
              extensionThis.storage.marginLeft !==
                extensionThis.options.marginLeft ||
              extensionThis.storage.marginRight !==
                extensionThis.options.marginRight ||
              extensionThis.storage.pageGap !== extensionThis.options.pageGap ||
              extensionThis.storage.contentMarginTop !==
                extensionThis.options.contentMarginTop ||
              extensionThis.storage.contentMarginBottom !==
                extensionThis.options.contentMarginBottom ||
              extensionThis.storage.headerLeft !==
                extensionThis.options.headerLeft ||
              extensionThis.storage.headerRight !==
                extensionThis.options.headerRight ||
              extensionThis.storage.headerCenter !==
                extensionThis.options.headerCenter ||
              extensionThis.storage.footerLeft !==
                extensionThis.options.footerLeft ||
              extensionThis.storage.footerRight !==
                extensionThis.options.footerRight ||
              extensionThis.storage.footerCenter !==
                extensionThis.options.footerCenter ||
              !deepEqualIterative(
                extensionThis.options.customHeader,
                extensionThis.storage.customHeader
              ) ||
              !deepEqualIterative(
                extensionThis.options.customFooter,
                extensionThis.storage.customFooter
              )
            ) {
              logDebug("Triggering decoration update", pageCount, {
                reason:
                  extensionThis.storage.pageHeight !==
                  extensionThis.options.pageHeight
                    ? "pageHeight changed"
                    : pageCount !== currentPageCount
                    ? "pageCount changed"
                    : "other",
              });
              return getNewDecoration();
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
          logDebug("View created", 0, {});

          return {
            update: (view: EditorView) => {
              const debugState = getDebugState();

              // SAFETY: Stop after 50 iterations
              if (debugState.callCount > 50) {
                console.error("🛑 MAX ITERATIONS (50) REACHED - STOPPING");
                console.log("📊 Debug history:", debugState.history.slice(-10));
                return;
              }

              const pageCount = calculatePageCount(view, extensionThis.options);
              const currentPageCount = getExistingPageCount(view);

              logDebug("View update", pageCount, {
                pageCount,
                currentPageCount,
                needsUpdate: currentPageCount !== pageCount,
              });

              const triggerUpdate = (_footerHeight?: FooterHeightMap) => {
                logDebug("Dispatching transaction", pageCount, {});
                requestAnimationFrame(() => {
                  const tr = view.state.tr.setMeta(page_count_meta_key, {
                    footerHeight: _footerHeight,
                  });
                  view.dispatch(tr);
                });
              };

              if (currentPageCount !== pageCount) {
                logDebug("Page count mismatch - triggering update", pageCount, {
                  current: currentPageCount,
                  target: pageCount,
                });
                triggerUpdate();
                return;
              }

              // Stable - log and continue
              logDebug("STABLE", currentPageCount, {});

              const headerHeight = getHeaderHeight(
                view.dom,
                getCustomPages(extensionThis.options.customHeader, {}),
                "content"
              );
              const footerHeight = getFooterHeight(
                view.dom,
                getCustomPages({}, extensionThis.options.customFooter),
                "content"
              );

              // ... rest of the update logic
              const footerHeightForCurrentPages = new Map<PageNumber, number>();
              for (let i = 0; i <= pageCount; i++) {
                if (footerHeight.has(i)) {
                  footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0);
                }
              }

              const headerHeightForCurrentPages = new Map<PageNumber, number>();
              for (let i = 0; i <= pageCount; i++) {
                if (headerHeight.has(i)) {
                  headerHeightForCurrentPages.set(i, headerHeight.get(i) || 0);
                }
              }

              const pagesSetToCheck = new Set([
                1,
                ...footerHeightForCurrentPages.keys(),
                ...headerHeightForCurrentPages.keys(),
              ]);

              let missingPageNumber: PageNumber | undefined = undefined;

              for (let i = 1; i <= pageCount; i++) {
                if (!pagesSetToCheck.has(i)) {
                  missingPageNumber = i;
                  break;
                }
              }

              if (missingPageNumber) {
                pagesSetToCheck.add(missingPageNumber);
              }

              pagesSetToCheck.delete(0);
              let pageContentHeightVariable: Record<string, string> = {};
              let maxContentHeight: number | undefined = undefined;
              for (const page of pagesSetToCheck) {
                const hHeight = headerHeightForCurrentPages.has(page)
                  ? headerHeightForCurrentPages.get(page) || 0
                  : headerHeightForCurrentPages.get(0) || 0;
                const fHeight = footerHeightForCurrentPages.has(page)
                  ? footerHeightForCurrentPages.get(page) || 0
                  : footerHeightForCurrentPages.get(0) || 0;
                const { _pageHeaderHeight, _pageHeight } = getHeight(
                  extensionThis.options,
                  hHeight,
                  fHeight
                );

                const contentHeight =
                  page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight;
                if (page === 1) {
                  pageContentHeightVariable[
                    `rm-page-content-first`
                  ] = `${contentHeight}px`;
                }
                if (page === missingPageNumber) {
                  pageContentHeightVariable[
                    `rm-page-content-general`
                  ] = `${contentHeight}px`;
                } else {
                  pageContentHeightVariable[
                    `rm-page-content-${page}`
                  ] = `${contentHeight}px`;
                }
                if (
                  maxContentHeight === undefined ||
                  contentHeight < maxContentHeight
                ) {
                  maxContentHeight = contentHeight;
                }
              }

              if (maxContentHeight) {
                view.dom.style.setProperty(
                  `--rm-max-content-child-height`,
                  `${maxContentHeight - 10}px`
                );
              }
              Object.entries(pageContentHeightVariable).forEach(
                ([key, value]) => {
                  view.dom.style.setProperty(`--${key}`, value);
                }
              );
              refreshPage(view.dom);

              return;
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
            if (
              tr.docChanged ||
              tr.steps.some((step) => step instanceof ReplaceStep) ||
              tr.steps.some((step) => step instanceof ReplaceAroundStep) ||
              tr.steps.some((step) => step instanceof AddMarkStep) ||
              tr.steps.some((step) => step instanceof RemoveMarkStep) ||
              tr.steps.some((step) => step instanceof RemoveNodeMarkStep) ||
              tr.steps.some((step) => step instanceof AttrStep)
            ) {
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
        console.log("📐 updatePageSize command:", size);
        resetDebugState();
        this.options.pageHeight = size.pageHeight;
        this.options.pageWidth = size.pageWidth;
        this.options.marginTop = size.marginTop;
        this.options.marginBottom = size.marginBottom;
        this.options.marginLeft = size.marginLeft;
        this.options.marginRight = size.marginRight;
        return true;
      },
      updatePageWidth: (width: number) => () => {
        resetDebugState();
        this.options.pageWidth = width;
        return true;
      },
      updatePageHeight: (height: number) => () => {
        resetDebugState();
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
  footerHeightMap: FooterHeightMap
): Decoration[] {
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
        pageBreak.style.left = `0px`;
        pageBreak.style.right = `0px`;
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

      // Calculate page count HERE in the widget
      const pageCount = calculatePageCount(view, pageOptions);

      logDebug("createDecoration - building pages", pageCount, {
        pageCount,
        pageHeight: pageOptions.pageHeight,
        pageWidth: pageOptions.pageWidth,
      });

      for (let i = 0; i < pageCount; i++) {
        const pageNumber = i + 1;
        const headerPageNumber = i + 2;
        if (
          headerPageNumber in pageOptions.customHeader ||
          pageNumber in pageOptions.customFooter ||
          pageNumber in pageOptions.customHeader
        ) {
          let _headerOptions: HeaderOptions = { ...commonHeaderOptions };
          let _footerOptions: FooterOptions = { ...commonFooterOptions };

          let _pageHeaderHeight = _headerHeight;
          let _pageFooterHeight = _footerHeight;
          if (headerPageNumber in pageOptions.customHeader) {
            const customHeader = pageOptions.customHeader[headerPageNumber];
            _headerOptions = {
              headerLeft:
                customHeader?.headerLeft || commonHeaderOptions.headerLeft,
              headerRight:
                customHeader?.headerRight || commonHeaderOptions.headerRight,
              headerCenter:
                customHeader?.headerCenter ||
                commonHeaderOptions.headerCenter ||
                "",
            };
            _pageHeaderHeight = headerHeightMap.get(headerPageNumber) || 0;
          }
          if (pageNumber in pageOptions.customFooter) {
            const customFooter = pageOptions.customFooter[pageNumber];
            _footerOptions = {
              footerLeft:
                customFooter?.footerLeft || commonFooterOptions.footerLeft,
              footerRight:
                customFooter?.footerRight || commonFooterOptions.footerRight,
              footerCenter:
                customFooter?.footerCenter ||
                commonFooterOptions.footerCenter ||
                "",
            };
            _pageFooterHeight = footerHeightMap.get(pageNumber) || 0;
          }

          let _pageHeader = getHeader(
            _headerOptions.headerRight,
            _headerOptions.headerLeft,
            _headerOptions.headerCenter || "",
            headerClickEvent(headerPageNumber, pageOptions.onHeaderClick),
            headerPageNumber
          );
          let _pageFooter = getFooter(
            _footerOptions.footerRight,
            _footerOptions.footerLeft,
            _footerOptions.footerCenter || "",
            footerClickEvent(pageNumber, pageOptions.onFooterClick),
            pageNumber
          );

          let pageBreak = pageBreakDefinition(
            i === 0,
            _pageHeader,
            _pageFooter,
            _pageHeaderHeight,
            _pageFooterHeight,
            pageNumber
          );
          fragment.appendChild(pageBreak);
        } else {
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
      const pageNumber = 1;

      let _headerOptions: HeaderOptions = { ...commonHeaderOptions };
      if (pageNumber in pageOptions.customHeader) {
        _headerOptions = pageOptions.customHeader[pageNumber];
      }
      const el = getHeader(
        _headerOptions.headerRight,
        _headerOptions.headerLeft,
        _headerOptions.headerCenter || "",
        headerClickEvent(pageNumber, pageOptions.onHeaderClick)
      );
      el.classList.add("rm-first-page-header");
      return el;
    },
    { side: -1 }
  );

  return [pageWidget, firstHeaderWidget];
}
