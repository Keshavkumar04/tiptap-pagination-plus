import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep, ReplaceAroundStep, AddMarkStep, RemoveMarkStep, RemoveNodeMarkStep, AttrStep, } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { deepEqualIterative, footerClickEvent, getCustomPages, getFooter, getFooterHeight, getHeader, getHeaderHeight, getHeight, headerClickEvent, updateCssVariables, } from "./utils";
const page_count_meta_key = "PAGE_COUNT_META_KEY";
const footer_height_meta_key = "FOOTER_HEIGHT_META_KEY";
// NEW: Maximum iterations to prevent infinite loop
const MAX_PAGINATION_ITERATIONS = 50;
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
    footerCenter: "", // NEW
    headerRight: "",
    headerLeft: "",
    headerCenter: "", // NEW
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
export const PaginationPlus = Extension.create({
    name: "PaginationPlus",
    addOptions() {
        return defaultOptions;
    },
    addStorage() {
        return Object.assign(Object.assign({}, defaultOptions), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 0, iterationCount: 0 });
    },
    onCreate() {
        const targetNode = this.editor.view.dom;
        targetNode.classList.add("rm-with-pagination");
        targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`;
        targetNode.style.paddingLeft = `var(--rm-margin-left)`;
        targetNode.style.paddingRight = `var(--rm-margin-right)`;
        targetNode.style.width = `var(--rm-page-width)`;
        updateCssVariables(targetNode, this.options);
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
        return [
            new Plugin({
                key: paginationKey,
                state: {
                    init: (_, state) => {
                        const widgetList = createDecoration(this.options, new Map(), new Map());
                        this.storage = Object.assign(Object.assign({}, this.options), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 0, iterationCount: 0 });
                        return {
                            decorations: DecorationSet.create(state.doc, widgetList),
                        };
                    },
                    apply: (tr, oldDeco, oldState, newState) => {
                        const pageCount = calculatePageCount(editor.view, this.options);
                        const currentPageCount = getExistingPageCount(editor.view);
                        const getNewDecoration = () => {
                            updateCssVariables(editor.view.dom, this.options);
                            let headerHeight = "headerHeight" in this.storage
                                ? this.storage.headerHeight
                                : new Map();
                            let footerHeight = "footerHeight" in this.storage
                                ? this.storage.footerHeight
                                : new Map();
                            const widgetList = createDecoration(this.options, headerHeight, footerHeight);
                            this.storage = Object.assign(Object.assign({}, this.options), { headerHeight,
                                footerHeight, lastPageCount: this.storage.lastPageCount, iterationCount: this.storage.iterationCount });
                            return {
                                decorations: DecorationSet.create(newState.doc, [
                                    ...widgetList,
                                ]),
                                footerHeight,
                            };
                        };
                        if ((pageCount > 1 ? pageCount : 1) !== currentPageCount ||
                            this.storage.pageBreakBackground !==
                                this.options.pageBreakBackground ||
                            this.storage.pageHeight !== this.options.pageHeight ||
                            this.storage.pageWidth !== this.options.pageWidth ||
                            this.storage.marginTop !== this.options.marginTop ||
                            this.storage.marginBottom !== this.options.marginBottom ||
                            this.storage.marginLeft !== this.options.marginLeft ||
                            this.storage.marginRight !== this.options.marginRight ||
                            this.storage.pageGap !== this.options.pageGap ||
                            this.storage.contentMarginTop !== this.options.contentMarginTop ||
                            this.storage.contentMarginBottom !==
                                this.options.contentMarginBottom ||
                            this.storage.headerLeft !== this.options.headerLeft ||
                            this.storage.headerRight !== this.options.headerRight ||
                            this.storage.headerCenter !== this.options.headerCenter || // NEW
                            this.storage.footerLeft !== this.options.footerLeft ||
                            this.storage.footerRight !== this.options.footerRight ||
                            this.storage.footerCenter !== this.options.footerCenter || // NEW
                            !deepEqualIterative(this.options.customHeader, this.storage.customHeader) ||
                            !deepEqualIterative(this.options.customFooter, this.storage.customFooter)) {
                            return getNewDecoration();
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
                    // NEW: Reset iteration count when view is created
                    this.storage.iterationCount = 0;
                    this.storage.lastPageCount = 0;
                    return {
                        update: (view) => {
                            const pageCount = calculatePageCount(view, this.options);
                            const currentPageCount = getExistingPageCount(view);
                            // NEW: Increment iteration count
                            this.storage.iterationCount++;
                            // NEW: Check for infinite loop - if we've iterated too many times, stop
                            if (this.storage.iterationCount > MAX_PAGINATION_ITERATIONS) {
                                console.warn(`PaginationPlus: Max iterations (${MAX_PAGINATION_ITERATIONS}) reached, stopping recalculation to prevent infinite loop`);
                                this.storage.iterationCount = 0; // Reset for next user action
                                return;
                            }
                            // NEW: Check for oscillation (page count bouncing between values)
                            const lastPageCount = this.storage.lastPageCount;
                            if (lastPageCount > 0 &&
                                Math.abs(pageCount - lastPageCount) <= 2 &&
                                this.storage.iterationCount > 10) {
                                this.storage.iterationCount = 0; // Reset for next user action
                                return;
                            }
                            this.storage.lastPageCount = pageCount;
                            const triggerUpdate = (_footerHeight) => {
                                requestAnimationFrame(() => {
                                    const tr = view.state.tr.setMeta(page_count_meta_key, {
                                        footerHeight: _footerHeight,
                                    });
                                    view.dispatch(tr);
                                });
                            };
                            if (currentPageCount !== pageCount) {
                                triggerUpdate();
                                return;
                            }
                            // NEW: Reset iteration count when page count matches (stable state)
                            this.storage.iterationCount = 0;
                            const headerHeight = getHeaderHeight(view.dom, getCustomPages(this.options.customHeader, {}), "content");
                            const footerHeight = getFooterHeight(view.dom, getCustomPages({}, this.options.customFooter), "content");
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
                                const headerHeight = headerHeightForCurrentPages.has(page)
                                    ? headerHeightForCurrentPages.get(page) || 0
                                    : headerHeightForCurrentPages.get(0) || 0;
                                const footerHeight = footerHeightForCurrentPages.has(page)
                                    ? footerHeightForCurrentPages.get(page) || 0
                                    : footerHeightForCurrentPages.get(0) || 0;
                                const { _pageHeaderHeight, _pageHeight } = getHeight(this.options, headerHeight, footerHeight);
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
                            return;
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
                        if (tr.docChanged ||
                            tr.steps.some((step) => step instanceof ReplaceStep) ||
                            tr.steps.some((step) => step instanceof ReplaceAroundStep) ||
                            tr.steps.some((step) => step instanceof AddMarkStep) ||
                            tr.steps.some((step) => step instanceof RemoveMarkStep) ||
                            tr.steps.some((step) => step instanceof RemoveNodeMarkStep) ||
                            tr.steps.some((step) => step instanceof AttrStep)) {
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
                // NEW: Reset iteration count when page size changes
                this.storage.iterationCount = 0;
                this.storage.lastPageCount = 0;
                this.options.pageHeight = size.pageHeight;
                this.options.pageWidth = size.pageWidth;
                this.options.marginTop = size.marginTop;
                this.options.marginBottom = size.marginBottom;
                this.options.marginLeft = size.marginLeft;
                this.options.marginRight = size.marginRight;
                return true;
            },
            updatePageWidth: (width) => () => {
                this.storage.iterationCount = 0;
                this.options.pageWidth = width;
                return true;
            },
            updatePageHeight: (height) => () => {
                this.storage.iterationCount = 0;
                this.options.pageHeight = height;
                return true;
            },
            updatePageGap: (gap) => () => {
                this.options.pageGap = gap;
                return true;
            },
            updateMargins: (margins) => () => {
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
            // UPDATED: Added center parameter
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
            // UPDATED: Added center parameter
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
const calculatePageCount = (view, pageOptions, headerHeight = 0, footerHeight = 0) => {
    var _a;
    const editorDom = view.dom;
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
    const pageContentAreaHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    // NEW: Safety check - if page content area is too small, return 1
    if (pageContentAreaHeight <= 50) {
        console.warn("PaginationPlus: Page content area too small, defaulting to 1 page");
        return 1;
    }
    const paginationElement = editorDom.querySelector("[data-rm-pagination]");
    const currentPageCount = getExistingPageCount(view);
    if (paginationElement) {
        const lastElementOfEditor = editorDom.lastElementChild;
        const lastPageBreak = (_a = paginationElement.lastElementChild) === null || _a === void 0 ? void 0 : _a.querySelector(".breaker");
        if (lastElementOfEditor && lastPageBreak) {
            const lastElementRect = lastElementOfEditor.getBoundingClientRect();
            const lastPageBreakRect = lastPageBreak.getBoundingClientRect();
            const lastPageGap = lastElementRect.bottom - lastPageBreakRect.bottom;
            if (lastPageGap > 0) {
                const addPage = Math.ceil(lastPageGap / pageContentAreaHeight);
                const newPageCount = currentPageCount + addPage;
                // NEW: Cap maximum pages to prevent runaway
                const maxPages = Math.ceil((editorDom.scrollHeight * 2) / pageContentAreaHeight);
                if (newPageCount > maxPages) {
                    console.warn(`PaginationPlus: Capping page count at ${maxPages} (calculated ${newPageCount})`);
                    return Math.min(newPageCount, maxPages);
                }
                return newPageCount;
            }
            else {
                const lpFrom = -10;
                const lpTo = -(pageOptions.pageHeight - 10);
                if (lastPageGap > lpTo && lastPageGap < lpFrom) {
                    return currentPageCount;
                }
                else if (lastPageGap < lpTo) {
                    const pageHeightOnRemove = pageOptions.pageHeight + pageOptions.pageGap;
                    const removePage = Math.floor(lastPageGap / pageHeightOnRemove);
                    return Math.max(1, currentPageCount + removePage); // NEW: Ensure at least 1 page
                }
                else {
                    return currentPageCount;
                }
            }
        }
        return 1;
    }
    else {
        const editorHeight = editorDom.scrollHeight;
        let pageCount = Math.ceil(editorHeight / pageContentAreaHeight);
        pageCount = pageCount <= 0 ? 1 : pageCount;
        return pageCount;
    }
};
function createDecoration(pageOptions, headerHeightMap, footerHeightMap) {
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
        const pageCount = calculatePageCount(view, pageOptions);
        for (let i = 0; i < pageCount; i++) {
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
                let _pageHeader = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", // NEW
                headerClickEvent(headerPageNumber, pageOptions.onHeaderClick), headerPageNumber);
                let _pageFooter = getFooter(_footerOptions.footerRight, _footerOptions.footerLeft, _footerOptions.footerCenter || "", // NEW
                footerClickEvent(pageNumber, pageOptions.onFooterClick), pageNumber);
                let pageBreak = pageBreakDefinition(i === 0, _pageHeader, _pageFooter, _pageHeaderHeight, _pageFooterHeight, pageNumber);
                fragment.appendChild(pageBreak);
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
        const pageNumber = 1;
        let _headerOptions = Object.assign({}, commonHeaderOptions);
        if (pageNumber in pageOptions.customHeader) {
            _headerOptions = pageOptions.customHeader[pageNumber];
        }
        const el = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", // NEW
        headerClickEvent(pageNumber, pageOptions.onHeaderClick));
        el.classList.add("rm-first-page-header");
        return el;
    }, { side: -1 });
    return [pageWidget, firstHeaderWidget];
}
