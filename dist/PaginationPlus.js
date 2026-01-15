import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getFooter, getHeader, getHeight, updateCssVariables, } from "./utils";
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
    console.log("🔄 [PP] RESET STATE");
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
// PAGE CALCULATION WITH DEBUGGING
// ============================================================================
function calculatePageCount(view, pageOptions, headerHeight = 0, footerHeight = 0) {
    const state = getState();
    if (state.locked) {
        return state.pageCount;
    }
    const currentDimKey = `${pageOptions.pageWidth}-${pageOptions.pageHeight}`;
    if (state.dimensionsKey !== currentDimKey) {
        console.log("📐 [PP] DIMENSIONS CHANGED:", {
            from: state.dimensionsKey,
            to: currentDimKey,
        });
        state.dimensionsKey = currentDimKey;
        state.pageCount = 1;
        state.updateCount = 0;
    }
    // Calculate content area per page
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight;
    const pageContentHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    console.log("📏 [PP] Page metrics:", {
        pageHeight: pageOptions.pageHeight,
        pageWidth: pageOptions.pageWidth,
        headerArea: _pageHeaderHeight,
        footerArea: _pageFooterHeight,
        CONTENT_AREA_PER_PAGE: pageContentHeight,
    });
    if (pageContentHeight <= 50) {
        state.pageCount = 1;
        return 1;
    }
    const editorDom = view.dom;
    const allChildren = Array.from(editorDom.children);
    console.log("👀 [PP] Editor children:", allChildren.length);
    // Find content elements
    const contentElements = [];
    for (const child of allChildren) {
        const el = child;
        const isPaginationElement = el.id === "pages" ||
            el.classList.contains("rm-pages-wrapper") ||
            el.classList.contains("rm-first-page-header") ||
            el.classList.contains("rm-page-header") ||
            el.classList.contains("rm-page-footer") ||
            el.classList.contains("rm-page-break") ||
            el.classList.contains("breaker") ||
            el.classList.contains("rm-pagination-gap") ||
            el.hasAttribute("data-rm-pagination");
        if (!isPaginationElement) {
            contentElements.push(el);
        }
    }
    console.log("📝 [PP] Content elements found:", contentElements.length);
    if (contentElements.length === 0) {
        state.pageCount = 1;
        return 1;
    }
    // Measure total content height - use actual content for tables
    let totalContentHeight = 0;
    contentElements.forEach((el, index) => {
        let height = 0;
        // For tableWrapper, measure the actual table rows, not the stretched container
        if (el.classList.contains("tableWrapper")) {
            const table = el.querySelector("table");
            if (table) {
                // Sum up all row heights to get actual table content height
                const rows = table.querySelectorAll("tr");
                let tableHeight = 0;
                rows.forEach((row) => {
                    tableHeight += row.offsetHeight;
                });
                // Add padding for borders
                height = tableHeight + 20;
                console.log(`  [${index}] TABLE (${rows.length} rows): ${height}px (container: ${el.getBoundingClientRect().height}px)`);
            }
            else {
                height = Math.min(el.scrollHeight, el.getBoundingClientRect().height);
                console.log(`  [${index}] ${el.tagName}: ${height}px`);
            }
        }
        else {
            height = el.getBoundingClientRect().height;
            console.log(`  [${index}] ${el.tagName}: ${height}px`);
        }
        totalContentHeight += height;
    });
    console.log("📊 [PP] TOTAL CONTENT HEIGHT:", totalContentHeight);
    if (totalContentHeight < 50) {
        state.pageCount = 1;
        return 1;
    }
    // Calculate pages based on total content height
    let pagesNeeded = Math.ceil(totalContentHeight / pageContentHeight);
    console.log("🔢 [PP] Initial calculation:", {
        totalContentHeight,
        pageContentHeight,
        PAGES_NEEDED: pagesNeeded,
    });
    pagesNeeded = Math.max(1, Math.min(pagesNeeded, MAX_PAGES));
    // Get current page count for comparison
    const currentPageCount = getExistingPageCount(view);
    console.log("📄 [PP] Current pages in DOM:", currentPageCount);
    // Simple approach: trust the content height calculation
    // Don't use overflow check because getBoundingClientRect() gives wrong values
    // when table containers stretch to fill page space
    console.log("🎯 [PP] FINAL PAGE COUNT:", pagesNeeded);
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
        console.log("🚀 [PP] Extension CREATED:", {
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
        const existingStyle = document.querySelector("[data-rm-pagination-style]");
        if (!existingStyle) {
            const style = document.createElement("style");
            style.dataset.rmPaginationStyle = "";
            style.textContent = `
        .rm-pagination-gap{border-top:1px solid;border-bottom:1px solid;border-color:var(--rm-page-gap-border-color)}
        .rm-with-pagination,.rm-with-pagination .rm-first-page-header{counter-reset:page-number page-number-plus 1}
        .rm-with-pagination .rm-page-break{counter-increment:page-number page-number-plus}
        .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap{display:none}
        .rm-with-pagination .rm-page-break:last-child .rm-page-header{display:none}
        .rm-with-pagination table{border-collapse:collapse;width:100%;display:contents}
        .rm-with-pagination table tbody{display:table;max-height:300px;overflow-y:auto}
        .rm-with-pagination table tbody>tr{display:table-row!important}
        .rm-with-pagination *:has(>br.ProseMirror-trailingBreak:only-child){display:table;width:100%}
        .rm-with-pagination .rm-br-decoration{display:table;width:100%}
        .rm-with-pagination .rm-page-footer-left,.rm-with-pagination .rm-page-footer-right,.rm-with-pagination .rm-page-footer-center,.rm-with-pagination .rm-page-header-left,.rm-with-pagination .rm-page-header-right,.rm-with-pagination .rm-page-header-center{display:inline-block}
        .rm-with-pagination .rm-page-header-left,.rm-with-pagination .rm-page-footer-left{float:left;margin-left:var(--rm-margin-left)}
        .rm-with-pagination .rm-page-header-right,.rm-with-pagination .rm-page-footer-right{float:right;margin-right:var(--rm-margin-right)}
        .rm-with-pagination .rm-page-header-center,.rm-with-pagination .rm-page-footer-center{position:absolute;left:50%;transform:translateX(-50%)}
        .rm-with-pagination .rm-first-page-header .rm-page-header-right{margin-right:0!important}
        .rm-with-pagination .rm-first-page-header .rm-page-header-left{margin-left:0!important}
        .rm-with-pagination .rm-page-number::before{content:counter(page-number)}
        .rm-with-pagination .rm-page-number-plus::before{content:counter(page-number-plus)}
        .rm-with-pagination .rm-page-header,.rm-with-pagination .rm-page-footer{width:100%}
        .rm-with-pagination .rm-page-header{padding-bottom:var(--rm-content-margin-top)!important;padding-top:var(--rm-margin-top)!important;display:inline-flex;justify-content:space-between;position:relative}
        .rm-with-pagination .rm-page-footer{padding-top:var(--rm-content-margin-bottom)!important;padding-bottom:var(--rm-margin-bottom)!important;display:inline-flex;justify-content:space-between;position:relative}
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
                        console.log("🔌 [PP] Plugin INIT");
                        const widgetList = createDecoration(extensionThis.options, new Map(), new Map(), 1);
                        extensionThis.storage = Object.assign(Object.assign({}, extensionThis.options), { headerHeight: new Map(), footerHeight: new Map(), lastPageCount: 1, initialized: false });
                        return { decorations: DecorationSet.create(state.doc, widgetList) };
                    },
                    apply: (tr, oldDeco, oldState, newState) => {
                        const ppState = getState();
                        if (ppState.locked)
                            return oldDeco;
                        const currentPageCount = getExistingPageCount(editor.view);
                        const calculatedPageCount = calculatePageCount(editor.view, extensionThis.options);
                        const settingsChanged = extensionThis.storage.pageHeight !==
                            extensionThis.options.pageHeight ||
                            extensionThis.storage.pageWidth !==
                                extensionThis.options.pageWidth;
                        const needsUpdate = calculatedPageCount !== currentPageCount || settingsChanged;
                        if (needsUpdate) {
                            ppState.updateCount++;
                            console.log(`🔄 [PP] Update #${ppState.updateCount}: ${currentPageCount} → ${calculatedPageCount}`);
                            if (ppState.updateCount > MAX_UPDATES) {
                                console.warn(`⛔ [PP] LOCKED at ${calculatedPageCount} pages`);
                                ppState.locked = true;
                                setTimeout(() => {
                                    ppState.locked = false;
                                    ppState.updateCount = 0;
                                    console.log("🔓 [PP] UNLOCKED");
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
                view: () => ({
                    update: (view) => {
                        const ppState = getState();
                        if (ppState.locked)
                            return;
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
                        refreshPage(view.dom);
                    },
                }),
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
                        if (tr.docChanged)
                            return buildDecorations(tr.doc);
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
                console.log("📐 [PP] updatePageSize:", size);
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
                console.log("📐 [PP] updatePageWidth:", width);
                resetState();
                this.options.pageWidth = width;
                return true;
            },
            updatePageHeight: (height) => () => {
                console.log("📐 [PP] updatePageHeight:", height);
                resetState();
                this.options.pageHeight = height;
                return true;
            },
            updatePageGap: (gap) => () => {
                this.options.pageGap = gap;
                return true;
            },
            updateMargins: (m) => () => {
                resetState();
                this.options.marginTop = m.top;
                this.options.marginBottom = m.bottom;
                this.options.marginLeft = m.left;
                this.options.marginRight = m.right;
                return true;
            },
            updateContentMargins: (m) => () => {
                this.options.contentMarginTop = m.top;
                this.options.contentMarginBottom = m.bottom;
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
    const paginationElement = view.dom.querySelector("[data-rm-pagination]");
    return paginationElement ? paginationElement.children.length : 0;
};
function createDecoration(pageOptions, headerHeightMap, footerHeightMap, pageCount) {
    const safePageCount = Math.max(1, Math.min(pageCount, MAX_PAGES));
    console.log(`🎨 [PP] Creating ${safePageCount} page decorations`);
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
    const pageWidget = Decoration.widget(0, () => {
        const el = document.createElement("div");
        el.dataset.rmPagination = "true";
        const _headerHeight = headerHeightMap.get(0) || 0;
        const _footerHeight = footerHeightMap.get(0) || 0;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < safePageCount; i++) {
            const { _pageHeaderHeight, _pageHeight } = getHeight(pageOptions, _headerHeight, _footerHeight);
            const pageContainer = document.createElement("div");
            pageContainer.classList.add("rm-page-break");
            const page = document.createElement("div");
            page.classList.add("page");
            page.style.position = "relative";
            page.style.float = "left";
            page.style.clear = "both";
            const marginTop = i === 0
                ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
                : _pageHeight + "px";
            page.style.marginTop =
                i === 0
                    ? `var(--rm-page-content-first, ${marginTop})`
                    : `var(--rm-page-content-general, ${marginTop})`;
            const pageBreak = document.createElement("div");
            pageBreak.classList.add("breaker");
            pageBreak.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`;
            pageBreak.style.marginLeft = `calc(-1 * var(--rm-margin-left))`;
            pageBreak.style.marginRight = `calc(-1 * var(--rm-margin-right))`;
            pageBreak.style.position = "relative";
            pageBreak.style.float = "left";
            pageBreak.style.clear = "both";
            pageBreak.style.zIndex = "2";
            const pageSpace = document.createElement("div");
            pageSpace.classList.add("rm-pagination-gap");
            pageSpace.style.height = pageOptions.pageGap + "px";
            pageSpace.style.borderLeft = "1px solid";
            pageSpace.style.borderRight = "1px solid";
            pageSpace.style.position = "relative";
            pageSpace.style.setProperty("width", "calc(100% + 2px)", "important");
            pageSpace.style.left = "-1px";
            pageSpace.style.backgroundColor = pageOptions.pageBreakBackground;
            const pageHeader = getHeader(commonHeaderOptions.headerRight, commonHeaderOptions.headerLeft, commonHeaderOptions.headerCenter || "", () => { });
            const pageFooter = getFooter(commonFooterOptions.footerRight, commonFooterOptions.footerLeft, commonFooterOptions.footerCenter || "", () => { });
            pageBreak.append(pageFooter, pageSpace, pageHeader);
            pageContainer.append(page, pageBreak);
            fragment.appendChild(pageContainer);
        }
        el.append(fragment);
        el.id = "pages";
        el.classList.add("rm-pages-wrapper");
        return el;
    }, { side: -1 });
    const firstHeaderWidget = Decoration.widget(0, () => {
        const el = getHeader(commonHeaderOptions.headerRight, commonHeaderOptions.headerLeft, commonHeaderOptions.headerCenter || "", () => { });
        el.classList.add("rm-first-page-header");
        return el;
    }, { side: -1 });
    return [pageWidget, firstHeaderWidget];
}
