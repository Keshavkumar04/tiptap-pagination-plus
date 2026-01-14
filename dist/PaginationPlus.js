import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep, ReplaceAroundStep, AddMarkStep, RemoveMarkStep, RemoveNodeMarkStep, AttrStep, } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { deepEqualIterative, footerClickEvent, getCustomPages, getFooter, getFooterHeight, getHeader, getHeaderHeight, getHeight, headerClickEvent, updateCssVariables, } from "./utils";
const page_count_meta_key = "PAGE_COUNT_META_KEY";
// Maximum iterations to prevent infinite loop
const MAX_PAGINATION_ITERATIONS = 30;
// GLOBAL state
let globalIterationCount = 0;
let globalBaseContentHeight = 0; // Store content height before pagination elements are added
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
/**
 * Calculate the ACTUAL content height, excluding pagination elements
 */
const getActualContentHeight = (editorDom) => {
    // Get all direct children that are NOT pagination-related
    const children = Array.from(editorDom.children);
    let totalHeight = 0;
    for (const child of children) {
        // Skip pagination wrapper and page breaks
        if (child.id === "pages" ||
            child.classList.contains("rm-pages-wrapper") ||
            child.classList.contains("rm-page-break") ||
            child.classList.contains("rm-first-page-header") ||
            child.hasAttribute("data-rm-pagination")) {
            continue;
        }
        // Get the actual rendered height of content elements
        const rect = child.getBoundingClientRect();
        totalHeight += rect.height;
    }
    return totalHeight;
};
/**
 * Calculate page count based on CONTENT only, not pagination elements
 */
const calculatePageCountFromContent = (contentHeight, pageOptions, headerHeight = 0, footerHeight = 0) => {
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
    // Available content area per page
    const pageContentAreaHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    if (pageContentAreaHeight <= 50) {
        console.warn("PaginationPlus: Page content area too small");
        return 1;
    }
    // Simple calculation: content height / available height per page
    const pageCount = Math.ceil(contentHeight / pageContentAreaHeight);
    return Math.max(1, pageCount);
};
export const PaginationPlus = Extension.create({
    name: "PaginationPlus",
    addOptions() {
        return defaultOptions;
    },
    addStorage() {
        return Object.assign(Object.assign({}, defaultOptions), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 0, iterationCount: 0, baseContentHeight: 0 });
    },
    onCreate() {
        // Reset global state on new editor
        globalIterationCount = 0;
        globalBaseContentHeight = 0;
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
        const extensionThis = this;
        return [
            new Plugin({
                key: paginationKey,
                state: {
                    init: (_, state) => {
                        const widgetList = createDecoration(extensionThis.options, new Map(), new Map());
                        extensionThis.storage = Object.assign(Object.assign({}, extensionThis.options), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 0, iterationCount: 0, baseContentHeight: 0 });
                        return {
                            decorations: DecorationSet.create(state.doc, widgetList),
                        };
                    },
                    apply: (tr, oldDeco, oldState, newState) => {
                        const getNewDecoration = () => {
                            updateCssVariables(editor.view.dom, extensionThis.options);
                            let headerHeight = "headerHeight" in extensionThis.storage
                                ? extensionThis.storage.headerHeight
                                : new Map();
                            let footerHeight = "footerHeight" in extensionThis.storage
                                ? extensionThis.storage.footerHeight
                                : new Map();
                            const widgetList = createDecoration(extensionThis.options, headerHeight, footerHeight);
                            extensionThis.storage = Object.assign(Object.assign({}, extensionThis.options), { headerHeight,
                                footerHeight, lastPageCount: extensionThis.storage.lastPageCount, iterationCount: extensionThis.storage.iterationCount, baseContentHeight: extensionThis.storage.baseContentHeight });
                            return {
                                decorations: DecorationSet.create(newState.doc, [
                                    ...widgetList,
                                ]),
                                footerHeight,
                            };
                        };
                        // Check if we need to recalculate
                        const needsRecalc = extensionThis.storage.pageBreakBackground !==
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
                            !deepEqualIterative(extensionThis.options.customHeader, extensionThis.storage.customHeader) ||
                            !deepEqualIterative(extensionThis.options.customFooter, extensionThis.storage.customFooter) ||
                            tr.docChanged;
                        if (needsRecalc) {
                            // Reset base content height when settings change
                            if (extensionThis.storage.pageHeight !==
                                extensionThis.options.pageHeight ||
                                extensionThis.storage.pageWidth !==
                                    extensionThis.options.pageWidth) {
                                globalBaseContentHeight = 0;
                                globalIterationCount = 0;
                            }
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
                    console.log("🔄 VIEW CREATED");
                    globalIterationCount = 0;
                    return {
                        update: (view) => {
                            globalIterationCount++;
                            // Get current and target page counts
                            const currentPageCount = getExistingPageCount(view);
                            // Calculate content height (excluding pagination elements)
                            const contentHeight = getActualContentHeight(view.dom);
                            // Store base content height on first calculation or when it increases
                            // (it should only increase when user adds content, not from pagination)
                            if (globalBaseContentHeight === 0 ||
                                contentHeight > globalBaseContentHeight * 1.5) {
                                globalBaseContentHeight = contentHeight;
                                console.log(`📏 Base content height set to: ${globalBaseContentHeight}px`);
                            }
                            // Calculate target page count based on BASE content height
                            const targetPageCount = calculatePageCountFromContent(globalBaseContentHeight, extensionThis.options);
                            console.log(`📄 #${globalIterationCount} | content:${contentHeight}px | base:${globalBaseContentHeight}px | curr:${currentPageCount} | target:${targetPageCount}`);
                            // Check for infinite loop
                            if (globalIterationCount > MAX_PAGINATION_ITERATIONS) {
                                console.warn(`🛑 Max iterations reached - stabilizing at ${currentPageCount} pages`);
                                globalIterationCount = 0;
                                return;
                            }
                            // If we're close to target, stop
                            if (Math.abs(currentPageCount - targetPageCount) <= 1) {
                                console.log(`✅ Stable at ${currentPageCount} pages`);
                                globalIterationCount = 0;
                                // Continue with height calculations
                                const headerHeight = getHeaderHeight(view.dom, getCustomPages(extensionThis.options.customHeader, {}), "content");
                                const footerHeight = getFooterHeight(view.dom, getCustomPages({}, extensionThis.options.customFooter), "content");
                                const footerHeightForCurrentPages = new Map();
                                for (let i = 0; i <= currentPageCount; i++) {
                                    if (footerHeight.has(i)) {
                                        footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0);
                                    }
                                }
                                const headerHeightForCurrentPages = new Map();
                                for (let i = 0; i <= currentPageCount; i++) {
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
                                for (let i = 1; i <= currentPageCount; i++) {
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
                                    const calcContentHeight = page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight;
                                    if (page === 1) {
                                        pageContentHeightVariable[`rm-page-content-first`] = `${calcContentHeight}px`;
                                    }
                                    if (page === missingPageNumber) {
                                        pageContentHeightVariable[`rm-page-content-general`] = `${calcContentHeight}px`;
                                    }
                                    else {
                                        pageContentHeightVariable[`rm-page-content-${page}`] = `${calcContentHeight}px`;
                                    }
                                    if (maxContentHeight === undefined ||
                                        calcContentHeight < maxContentHeight) {
                                        maxContentHeight = calcContentHeight;
                                    }
                                }
                                if (maxContentHeight) {
                                    view.dom.style.setProperty(`--rm-max-content-child-height`, `${maxContentHeight - 10}px`);
                                }
                                Object.entries(pageContentHeightVariable).forEach(([k, v]) => {
                                    view.dom.style.setProperty(`--${k}`, v);
                                });
                                refreshPage(view.dom);
                                return;
                            }
                            // Need to update page count
                            const triggerUpdate = () => {
                                requestAnimationFrame(() => {
                                    const tr = view.state.tr.setMeta(page_count_meta_key, {});
                                    view.dispatch(tr);
                                });
                            };
                            triggerUpdate();
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
                // Reset when page size changes
                globalIterationCount = 0;
                globalBaseContentHeight = 0;
                this.options.pageHeight = size.pageHeight;
                this.options.pageWidth = size.pageWidth;
                this.options.marginTop = size.marginTop;
                this.options.marginBottom = size.marginBottom;
                this.options.marginLeft = size.marginLeft;
                this.options.marginRight = size.marginRight;
                return true;
            },
            updatePageWidth: (width) => () => {
                globalIterationCount = 0;
                globalBaseContentHeight = 0;
                this.options.pageWidth = width;
                return true;
            },
            updatePageHeight: (height) => () => {
                globalIterationCount = 0;
                globalBaseContentHeight = 0;
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
        // Use base content height for page count calculation
        const pageCount = globalBaseContentHeight > 0
            ? calculatePageCountFromContent(globalBaseContentHeight, pageOptions)
            : 1;
        console.log(`🎨 Creating decorations for ${pageCount} pages (baseHeight: ${globalBaseContentHeight})`);
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
                let _pageHeader = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", headerClickEvent(headerPageNumber, pageOptions.onHeaderClick), headerPageNumber);
                let _pageFooter = getFooter(_footerOptions.footerRight, _footerOptions.footerLeft, _footerOptions.footerCenter || "", footerClickEvent(pageNumber, pageOptions.onFooterClick), pageNumber);
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
        const el = getHeader(_headerOptions.headerRight, _headerOptions.headerLeft, _headerOptions.headerCenter || "", headerClickEvent(pageNumber, pageOptions.onHeaderClick));
        el.classList.add("rm-first-page-header");
        return el;
    }, { side: -1 });
    return [pageWidget, firstHeaderWidget];
}
