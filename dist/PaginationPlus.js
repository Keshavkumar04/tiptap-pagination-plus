import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { deepEqualIterative, footerClickEvent, getCustomPages, getFooter, getFooterHeight, getHeader, getHeaderHeight, getHeight, headerClickEvent, updateCssVariables, } from "./utils";
function getState() {
    if (!window.__pp_state) {
        window.__pp_state = {
            pageCount: 1,
            locked: false,
            updateCount: 0,
            dimensionsKey: "",
        };
    }
    return window.__pp_state;
}
function resetState() {
    window.__pp_state = {
        pageCount: 1,
        locked: false,
        updateCount: 0,
        dimensionsKey: "",
    };
}
// ============================================================================
const page_count_meta_key = "PAGE_COUNT_META_KEY";
const MAX_PAGES = 500;
const MAX_UPDATES = 15;
const key = new PluginKey("brDecoration");
function buildDecorations(doc) {
    const decorations = [];
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
const defaultOptions = {
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
const refreshPage = (targetNode) => {
    var _a;
    const paginationElement = targetNode.querySelector("[data-rm-pagination]");
    if (paginationElement) {
        const lastPageBreak = (_a = paginationElement.lastElementChild) === null || _a === void 0 ? void 0 : _a.querySelector(".breaker");
        if (lastPageBreak) {
            const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight;
            targetNode.style.minHeight = `calc(${minHeight}px + 2px)`;
        }
    }
};
const paginationKey = new PluginKey("pagination");
// ============================================================================
// FIXED PAGE CALCULATION - V2
// The key fix: Only measure actual content elements, ignoring ALL pagination
// decorations. Use getBoundingClientRect for accurate measurements.
// ============================================================================
function calculatePageCount(view, pageOptions, headerHeight = 0, footerHeight = 0) {
    var _a;
    const state = getState();
    if (state.locked) {
        return state.pageCount;
    }
    // Check if dimensions changed
    const currentDimKey = `${pageOptions.pageWidth}-${pageOptions.pageHeight}`;
    if (state.dimensionsKey !== currentDimKey) {
        state.dimensionsKey = currentDimKey;
        state.pageCount = 1;
        state.updateCount = 0;
    }
    // Calculate content area per page
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
    const pageContentHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    if (pageContentHeight <= 50) {
        state.pageCount = 1;
        return 1;
    }
    const editorDom = view.dom;
    // =========================================================================
    // Get actual content elements (exclude ALL pagination elements)
    // =========================================================================
    const contentElements = [];
    const children = Array.from(editorDom.children);
    for (const child of children) {
        const el = child;
        // Skip ALL pagination-related elements by checking multiple conditions
        if (el.id === "pages" ||
            el.classList.contains("rm-pages-wrapper") ||
            el.classList.contains("rm-first-page-header") ||
            el.classList.contains("rm-page-header") ||
            el.classList.contains("rm-page-footer") ||
            el.classList.contains("rm-page-break") ||
            el.classList.contains("breaker") ||
            el.classList.contains("rm-pagination-gap") ||
            el.hasAttribute("data-rm-pagination") ||
            el.closest("[data-rm-pagination]") !== null) {
            continue;
        }
        contentElements.push(el);
    }
    // If no content elements, return 1 page
    if (contentElements.length === 0) {
        state.pageCount = 1;
        return 1;
    }
    // Measure total content height using bounding rects
    let totalContentHeight = 0;
    for (const el of contentElements) {
        const rect = el.getBoundingClientRect();
        totalContentHeight += rect.height;
    }
    // For minimal content, use 1 page
    if (totalContentHeight < 50) {
        state.pageCount = 1;
        return 1;
    }
    // Calculate initial estimate
    let pagesNeeded = Math.ceil(totalContentHeight / pageContentHeight);
    pagesNeeded = Math.max(1, Math.min(pagesNeeded, MAX_PAGES));
    // =========================================================================
    // STABILITY: Check actual overflow with current pagination
    // =========================================================================
    const currentPageCount = getExistingPageCount(view);
    const paginationElement = editorDom.querySelector("[data-rm-pagination]");
    if (paginationElement && currentPageCount > 0 && contentElements.length > 0) {
        const lastPageBreak = (_a = paginationElement.lastElementChild) === null || _a === void 0 ? void 0 : _a.querySelector(".breaker");
        if (lastPageBreak) {
            const lastContent = contentElements[contentElements.length - 1];
            const lastContentRect = lastContent.getBoundingClientRect();
            const lastBreakRect = lastPageBreak.getBoundingClientRect();
            const overflow = lastContentRect.bottom - lastBreakRect.bottom;
            if (overflow > 20) {
                // Content overflows - add more pages
                const additionalPages = Math.ceil(overflow / pageContentHeight);
                pagesNeeded = Math.min(currentPageCount + additionalPages, MAX_PAGES);
            }
            else if (overflow >= -50) {
                // Content fits well - keep current count
                pagesNeeded = currentPageCount;
            }
            else if (overflow < -(pageContentHeight + pageOptions.pageGap) &&
                currentPageCount > 1) {
                // Significant empty space - reduce pages conservatively
                const emptySpace = Math.abs(overflow);
                const emptyPages = Math.floor(emptySpace / (pageContentHeight + pageOptions.pageGap));
                // Only reduce if we have 2+ empty pages to avoid oscillation
                if (emptyPages >= 2) {
                    pagesNeeded = Math.max(1, currentPageCount - (emptyPages - 1));
                }
                else {
                    pagesNeeded = currentPageCount;
                }
            }
            else {
                // Keep current
                pagesNeeded = currentPageCount;
            }
        }
    }
    state.pageCount = pagesNeeded;
    return pagesNeeded;
}
// ============================================================================
export const PaginationPlus = Extension.create({
    name: "PaginationPlus",
    addOptions() {
        return defaultOptions;
    },
    addStorage() {
        return Object.assign(Object.assign({}, defaultOptions), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 1, initialized: false });
    },
    onCreate() {
        resetState();
        const targetNode = this.editor.view.dom;
        targetNode.classList.add("rm-with-pagination");
        targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`;
        targetNode.style.paddingLeft = `var(--rm-margin-left)`;
        targetNode.style.paddingRight = `var(--rm-margin-right)`;
        targetNode.style.width = `var(--rm-page-width)`;
        updateCssVariables(targetNode, this.options);
        // Add styles (only once)
        const existingStyle = document.querySelector("[data-rm-pagination-style]");
        if (!existingStyle) {
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
        }
        refreshPage(targetNode);
        this.storage.initialized = true;
    },
    addProseMirrorPlugins() {
        const editor = this.editor;
        const extensionThis = this;
        return [
            new Plugin({
                key: paginationKey,
                state: {
                    init: (_, state) => {
                        const widgetList = createDecoration(extensionThis.options, new Map(), new Map(), 1);
                        extensionThis.storage = Object.assign(Object.assign({}, extensionThis.options), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 1, initialized: false });
                        return {
                            decorations: DecorationSet.create(state.doc, widgetList),
                        };
                    },
                    apply: (tr, oldDeco, oldState, newState) => {
                        const ppState = getState();
                        if (ppState.locked) {
                            return oldDeco;
                        }
                        const currentPageCount = getExistingPageCount(editor.view);
                        const calculatedPageCount = calculatePageCount(editor.view, extensionThis.options);
                        const settingsChanged = extensionThis.storage.pageHeight !==
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
                                extensionThis.options.marginRight;
                        const needsUpdate = calculatedPageCount !== currentPageCount ||
                            settingsChanged ||
                            !deepEqualIterative(extensionThis.options.customHeader, extensionThis.storage.customHeader) ||
                            !deepEqualIterative(extensionThis.options.customFooter, extensionThis.storage.customFooter);
                        if (needsUpdate) {
                            ppState.updateCount++;
                            if (ppState.updateCount > MAX_UPDATES) {
                                ppState.locked = true;
                                setTimeout(() => {
                                    ppState.locked = false;
                                    ppState.updateCount = 0;
                                }, 500);
                                return oldDeco;
                            }
                            updateCssVariables(editor.view.dom, extensionThis.options);
                            const widgetList = createDecoration(extensionThis.options, extensionThis.storage.headerHeight || new Map(), extensionThis.storage.footerHeight || new Map(), calculatedPageCount);
                            extensionThis.storage = Object.assign(Object.assign({}, extensionThis.options), { headerHeight: extensionThis.storage.headerHeight || new Map(), footerHeight: extensionThis.storage.footerHeight || new Map(), lastPageCount: calculatedPageCount, initialized: true });
                            return {
                                decorations: DecorationSet.create(newState.doc, widgetList),
                            };
                        }
                        return oldDeco;
                    },
                },
                props: {
                    decorations(state) {
                        var _a;
                        return (_a = this.getState(state)) === null || _a === void 0 ? void 0 : _a.decorations;
                    },
                },
                view: (editorView) => {
                    return {
                        update: (view) => {
                            const ppState = getState();
                            if (ppState.locked) {
                                return;
                            }
                            const currentPageCount = getExistingPageCount(view);
                            const calculatedPageCount = calculatePageCount(view, extensionThis.options);
                            if (currentPageCount !== calculatedPageCount) {
                                ppState.updateCount++;
                                if (ppState.updateCount > MAX_UPDATES) {
                                    ppState.locked = true;
                                    setTimeout(() => {
                                        ppState.locked = false;
                                        ppState.updateCount = 0;
                                    }, 500);
                                    return;
                                }
                                requestAnimationFrame(() => {
                                    if (!ppState.locked && !view.isDestroyed) {
                                        const tr = view.state.tr.setMeta(page_count_meta_key, {});
                                        view.dispatch(tr);
                                    }
                                });
                                return;
                            }
                            ppState.updateCount = 0;
                            const headerHeight = getHeaderHeight(view.dom, getCustomPages(extensionThis.options.customHeader, {}), "content");
                            const footerHeight = getFooterHeight(view.dom, getCustomPages({}, extensionThis.options.customFooter), "content");
                            const pageCount = currentPageCount;
                            const footerHeightForCurrentPages = new Map();
                            for (let i = 0; i <= pageCount; i++) {
                                if (footerHeight.has(i)) {
                                    footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0);
                                }
                            }
                            const headerHeightForCurrentPages = new Map();
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
                            let missingPageNumber = undefined;
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
                            let pageContentHeightVariable = {};
                            let maxContentHeight = undefined;
                            for (const page of pagesSetToCheck) {
                                const hHeight = headerHeightForCurrentPages.has(page)
                                    ? headerHeightForCurrentPages.get(page) || 0
                                    : headerHeightForCurrentPages.get(0) || 0;
                                const fHeight = footerHeightForCurrentPages.has(page)
                                    ? footerHeightForCurrentPages.get(page) || 0
                                    : footerHeightForCurrentPages.get(0) || 0;
                                const { _pageHeaderHeight, _pageHeight } = getHeight(extensionThis.options, hHeight, fHeight);
                                const contentHeight = page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight;
                                if (page === 1) {
                                    pageContentHeightVariable[`rm-page-content-first`] = `${contentHeight}px`;
                                }
                                if (page === missingPageNumber) {
                                    pageContentHeightVariable[`rm-page-content-general`] = `${contentHeight}px`;
                                }
                                else {
                                    pageContentHeightVariable[`rm-page-content-${page}`] = `${contentHeight}px`;
                                }
                                if (maxContentHeight === undefined ||
                                    contentHeight < maxContentHeight) {
                                    maxContentHeight = contentHeight;
                                }
                            }
                            if (maxContentHeight) {
                                view.dom.style.setProperty(`--rm-max-content-child-height`, `${maxContentHeight - 10}px`);
                            }
                            Object.entries(pageContentHeightVariable).forEach(([key, value]) => {
                                view.dom.style.setProperty(`--${key}`, value);
                            });
                            refreshPage(view.dom);
                        },
                    };
                },
            }),
            new Plugin({
                key,
                state: {
                    init(_, state) {
                        return buildDecorations(state.doc);
                    },
                    apply(tr, old) {
                        if (getState().locked)
                            return old;
                        if (tr.docChanged) {
                            return buildDecorations(tr.doc);
                        }
                        return old;
                    },
                },
                props: {
                    decorations(state) {
                        var _a;
                        return (_a = key.getState(state)) !== null && _a !== void 0 ? _a : DecorationSet.empty;
                    },
                },
            }),
        ];
    },
    addCommands() {
        return {
            updatePageBreakBackground: (color) => () => {
                this.options.pageBreakBackground = color;
                return true;
            },
            updatePageSize: (size) => () => {
                resetState();
                this.options.pageHeight = size.pageHeight;
                this.options.pageWidth = size.pageWidth;
                this.options.marginTop = size.marginTop;
                this.options.marginBottom = size.marginBottom;
                this.options.marginLeft = size.marginLeft;
                this.options.marginRight = size.marginRight;
                return true;
            },
            updatePageWidth: (width) => () => {
                resetState();
                this.options.pageWidth = width;
                return true;
            },
            updatePageHeight: (height) => () => {
                resetState();
                this.options.pageHeight = height;
                return true;
            },
            updatePageGap: (gap) => () => {
                this.options.pageGap = gap;
                return true;
            },
            updateMargins: (margins) => () => {
                resetState();
                this.options.marginTop = margins.top;
                this.options.marginBottom = margins.bottom;
                this.options.marginLeft = margins.left;
                this.options.marginRight = margins.right;
                return true;
            },
            updateContentMargins: (margins) => () => {
                this.options.contentMarginTop = margins.top;
                this.options.contentMarginBottom = margins.bottom;
                return true;
            },
            updateHeaderContent: (left, right, center, pageNumber) => () => {
                if (pageNumber) {
                    this.options.customHeader = Object.assign(Object.assign({}, this.options.customHeader), { [pageNumber]: {
                            headerLeft: left,
                            headerRight: right,
                            headerCenter: center || "",
                        } });
                }
                else {
                    this.options.headerLeft = left;
                    this.options.headerRight = right;
                    this.options.headerCenter = center || "";
                }
                return true;
            },
            updateFooterContent: (left, right, center, pageNumber) => () => {
                if (pageNumber) {
                    this.options.customFooter = Object.assign(Object.assign({}, this.options.customFooter), { [pageNumber]: {
                            footerLeft: left,
                            footerRight: right,
                            footerCenter: center || "",
                        } });
                }
                else {
                    this.options.footerLeft = left;
                    this.options.footerRight = right;
                    this.options.footerCenter = center || "";
                }
                return true;
            },
        };
    },
});
const getExistingPageCount = (view) => {
    const editorDom = view.dom;
    const paginationElement = editorDom.querySelector("[data-rm-pagination]");
    if (paginationElement) {
        return paginationElement.children.length;
    }
    return 0;
};
function createDecoration(pageOptions, headerHeightMap, footerHeightMap, pageCount) {
    const safePageCount = Math.max(1, Math.min(pageCount, MAX_PAGES));
    const commonHeaderOptions = {
        headerLeft: pageOptions.headerLeft,
        headerRight: pageOptions.headerRight,
        headerCenter: pageOptions.headerCenter || "",
    };
    const commonFooterOptions = {
        footerLeft: pageOptions.footerLeft,
        footerRight: pageOptions.footerRight,
        footerCenter: pageOptions.footerCenter || "",
    };
    const pageWidget = Decoration.widget(0, (view) => {
        const _pageGap = pageOptions.pageGap;
        const _pageBreakBackground = pageOptions.pageBreakBackground;
        const el = document.createElement("div");
        el.dataset.rmPagination = "true";
        const pageBreakDefinition = (firstPage, pageHeader, pageFooter, headerHeight, footerHeight, pageNumber) => {
            const { _pageHeaderHeight, _pageHeight } = getHeight(pageOptions, headerHeight, footerHeight);
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
            }
            else {
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
        for (let i = 0; i < safePageCount; i++) {
            const pageNumber = i + 1;
            const headerPageNumber = i + 2;
            if (headerPageNumber in pageOptions.customHeader ||
                pageNumber in pageOptions.customFooter ||
                pageNumber in pageOptions.customHeader) {
                let _headerOptions = Object.assign({}, commonHeaderOptions);
                let _footerOptions = Object.assign({}, commonFooterOptions);
                let _pageHeaderHeight = _headerHeight;
                let _pageFooterHeight = _footerHeight;
                if (headerPageNumber in pageOptions.customHeader) {
                    const customHeader = pageOptions.customHeader[headerPageNumber];
                    _headerOptions = {
                        headerLeft: (customHeader === null || customHeader === void 0 ? void 0 : customHeader.headerLeft) || commonHeaderOptions.headerLeft,
                        headerRight: (customHeader === null || customHeader === void 0 ? void 0 : customHeader.headerRight) || commonHeaderOptions.headerRight,
                        headerCenter: (customHeader === null || customHeader === void 0 ? void 0 : customHeader.headerCenter) ||
                            commonHeaderOptions.headerCenter ||
                            "",
                    };
                    _pageHeaderHeight = headerHeightMap.get(headerPageNumber) || 0;
                }
                if (pageNumber in pageOptions.customFooter) {
                    const customFooter = pageOptions.customFooter[pageNumber];
                    _footerOptions = {
                        footerLeft: (customFooter === null || customFooter === void 0 ? void 0 : customFooter.footerLeft) || commonFooterOptions.footerLeft,
                        footerRight: (customFooter === null || customFooter === void 0 ? void 0 : customFooter.footerRight) || commonFooterOptions.footerRight,
                        footerCenter: (customFooter === null || customFooter === void 0 ? void 0 : customFooter.footerCenter) ||
                            commonFooterOptions.footerCenter ||
                            "",
                    };
                    _pageFooterHeight = footerHeightMap.get(pageNumber) || 0;
                }
                let _pageHeader = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", headerClickEvent(headerPageNumber, pageOptions.onHeaderClick), headerPageNumber);
                let _pageFooter = getFooter(_footerOptions.footerRight, _footerOptions.footerLeft, _footerOptions.footerCenter || "", footerClickEvent(pageNumber, pageOptions.onFooterClick), pageNumber);
                fragment.appendChild(pageBreakDefinition(i === 0, _pageHeader, _pageFooter, _pageHeaderHeight, _pageFooterHeight, pageNumber));
            }
            else {
                const __pageHeader = getHeader(commonHeaderOptions.headerRight, commonHeaderOptions.headerLeft, commonHeaderOptions.headerCenter || "", headerClickEvent(headerPageNumber, pageOptions.onHeaderClick));
                const __pageFooter = getFooter(commonFooterOptions.footerRight, commonFooterOptions.footerLeft, commonFooterOptions.footerCenter || "", footerClickEvent(pageNumber, pageOptions.onFooterClick));
                fragment.appendChild(pageBreakDefinition(i === 0, __pageHeader, __pageFooter, _headerHeight, _footerHeight));
            }
        }
        el.append(fragment);
        el.id = "pages";
        el.classList.add("rm-pages-wrapper");
        return el;
    }, { side: -1 });
    const firstHeaderWidget = Decoration.widget(0, () => {
        let _headerOptions = Object.assign({}, commonHeaderOptions);
        if (1 in pageOptions.customHeader) {
            _headerOptions = pageOptions.customHeader[1];
        }
        const el = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", headerClickEvent(1, pageOptions.onHeaderClick));
        el.classList.add("rm-first-page-header");
        return el;
    }, { side: -1 });
    return [pageWidget, firstHeaderWidget];
}
