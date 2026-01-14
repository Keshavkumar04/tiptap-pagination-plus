export const updateCssVariables = (targetNode, config) => {
    const cssVariables = {
        "rm-page-height": `${config.pageHeight}px`,
        "rm-margin-top": `${config.marginTop}px`,
        "rm-margin-bottom": `${config.marginBottom}px`,
        "rm-margin-left": `${config.marginLeft}px`,
        "rm-margin-right": `${config.marginRight}px`,
        "rm-content-margin-top": `${config.contentMarginTop}px`,
        "rm-content-margin-bottom": `${config.contentMarginBottom}px`,
        "rm-page-gap-border-color": `${config.pageGapBorderColor}`,
        "rm-page-width": `${config.pageWidth}px`,
    };
    Object.entries(cssVariables).forEach(([key, value]) => {
        targetNode.style.setProperty(`--${key}`, value);
    });
};
export const getPageSize = (height, width, marginTop, marginBottom, marginLeft, marginRight) => {
    return {
        pageHeight: height,
        pageWidth: width,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
    };
};
export const getHeaderHeight = (targetNode, pageNumbers, type) => {
    const headerHeightMap = new Map();
    // Find general header height
    const clientHeader = targetNode.querySelector(getHeaderHeightSelector(0, type));
    headerHeightMap.set(0, clientHeader ? clientHeader.clientHeight : 0);
    // Find header height for each page number
    pageNumbers.forEach((pageNumber) => {
        const clientHeader = targetNode.querySelector(getHeaderHeightSelector(pageNumber, type));
        const headerHeight = clientHeader ? clientHeader.clientHeight : 0;
        headerHeightMap.set(pageNumber, headerHeight);
    });
    return headerHeightMap;
};
export const getHeaderHeightSelector = (pageNumber, type) => {
    return type === "actual"
        ? `.rm-page-header-${pageNumber}`
        : `.rm-page-header-${pageNumber} .rm-page-header-content`;
};
export const getFooterHeight = (targetNode, pageNumbers, type) => {
    const footerHeightMap = new Map();
    // Find general footer height
    const clientFooter = targetNode.querySelector(getFooterHeightSelector(0, type));
    footerHeightMap.set(0, clientFooter ? clientFooter.clientHeight : 0);
    // Find footer height for each page number
    pageNumbers.forEach((pageNumber) => {
        const clientFooter = targetNode.querySelector(getFooterHeightSelector(pageNumber, type));
        const footerHeight = clientFooter ? clientFooter.clientHeight : 0;
        footerHeightMap.set(pageNumber, footerHeight);
    });
    return footerHeightMap;
};
export const getFooterHeightSelector = (pageNumber, type) => {
    return type === "actual"
        ? `.rm-page-footer-${pageNumber}`
        : `.rm-page-footer-${pageNumber} .rm-page-footer-content`;
};
export function deepEqualIterative(a, b) {
    // Quick reference check
    if (a === b)
        return true;
    // One is null or type mismatch
    if (typeof a !== "object" ||
        typeof b !== "object" ||
        a == null ||
        b == null) {
        return false;
    }
    // Stack for iterative traversal
    const stack = [{ x: a, y: b }];
    while (stack.length) {
        const _stackItem = stack.pop();
        if (!_stackItem)
            continue;
        const { x, y } = _stackItem;
        // If primitive mismatch
        if (x === y)
            continue;
        if (typeof x !== typeof y)
            return false;
        if (typeof x !== "object")
            return false;
        if (x == null || y == null)
            return false;
        const xKeys = Object.keys(x);
        const yKeys = Object.keys(y);
        // Length mismatch
        if (xKeys.length !== yKeys.length)
            return false;
        // Check keys
        for (const key of xKeys) {
            if (!(key in y))
                return false;
            const xVal = x[key];
            const yVal = y[key];
            // Same reference — skip
            if (xVal === yVal)
                continue;
            // Push nested objects/arrays to stack
            if (typeof xVal === "object" && typeof yVal === "object") {
                stack.push({ x: xVal, y: yVal });
            }
            else {
                // Primitive compare
                if (xVal !== yVal)
                    return false;
            }
        }
    }
    return true;
}
export function mapNumberEqual(a, b) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size)
        return false;
    for (const [k, v] of a) {
        if (b.get(k) !== v)
            return false;
    }
    return true;
}
export function getCustomPages(customHeader, customFooter) {
    return [...Object.keys(customHeader), ...Object.keys(customFooter)].map(Number);
}
// UPDATED: Added centerContent parameter
export function getFooter(footerRightContent, footerLeftContent, footerCenterContent, // NEW
onFooterClick, pageNumber) {
    const pageFooter = document.createElement("div");
    pageFooter.classList.add("rm-page-footer");
    pageFooter.classList.add(`rm-page-footer-${pageNumber ? pageNumber : 0}`);
    pageFooter.style.overflow = "visible";
    pageFooter.style.position = "relative";
    pageFooter.style.cursor = "pointer";
    const pageFooterContent = document.createElement("div");
    pageFooterContent.classList.add("rm-page-footer-content");
    pageFooterContent.style.width = "100%";
    pageFooterContent.style.overflow = "hidden";
    const footerRight = footerRightContent.replace("{page}", `<span class="rm-page-number"></span>`);
    const footerLeft = footerLeftContent.replace("{page}", `<span class="rm-page-number"></span>`);
    // NEW: Process center content
    const footerCenter = footerCenterContent.replace("{page}", `<span class="rm-page-number"></span>`);
    const pageFooterLeft = document.createElement("div");
    pageFooterLeft.classList.add("rm-page-footer-left");
    pageFooterLeft.innerHTML = footerLeft;
    // NEW: Create center element
    const pageFooterCenter = document.createElement("div");
    pageFooterCenter.classList.add("rm-page-footer-center");
    pageFooterCenter.innerHTML = footerCenter;
    const pageFooterRight = document.createElement("div");
    pageFooterRight.classList.add("rm-page-footer-right");
    pageFooterRight.innerHTML = footerRight;
    // NEW: Append all three (left, center, right)
    pageFooterContent.append(pageFooterLeft, pageFooterCenter, pageFooterRight);
    pageFooter.append(pageFooterContent);
    pageFooter.addEventListener("click", onFooterClick);
    return pageFooter;
}
// UPDATED: Added centerContent parameter
export function getHeader(headerRightContent, headerLeftContent, headerCenterContent, // NEW
onHeaderClick, pageNumber) {
    const pageHeader = document.createElement("div");
    pageHeader.classList.add("rm-page-header");
    pageHeader.classList.add(`rm-page-header-${pageNumber ? pageNumber : 0}`);
    pageHeader.style.overflow = "hidden";
    pageHeader.style.cursor = "pointer";
    pageHeader.style.position = "relative";
    const pageHeaderContent = document.createElement("div");
    pageHeaderContent.classList.add("rm-page-header-content");
    pageHeaderContent.style.width = "100%";
    pageHeaderContent.style.overflow = "hidden";
    const headerLeft = headerLeftContent.replace("{page}", `<span class="rm-page-number-plus"></span>`);
    const headerRight = headerRightContent.replace("{page}", `<span class="rm-page-number-plus"></span>`);
    // NEW: Process center content
    const headerCenter = headerCenterContent.replace("{page}", `<span class="rm-page-number-plus"></span>`);
    const pageHeaderLeft = document.createElement("div");
    pageHeaderLeft.classList.add("rm-page-header-left");
    pageHeaderLeft.innerHTML = headerLeft;
    // NEW: Create center element
    const pageHeaderCenter = document.createElement("div");
    pageHeaderCenter.classList.add("rm-page-header-center");
    pageHeaderCenter.innerHTML = headerCenter;
    const pageHeaderRight = document.createElement("div");
    pageHeaderRight.classList.add("rm-page-header-right");
    pageHeaderRight.innerHTML = headerRight;
    // NEW: Append all three (left, center, right)
    pageHeaderContent.append(pageHeaderLeft, pageHeaderCenter, pageHeaderRight);
    pageHeader.append(pageHeaderContent);
    pageHeader.addEventListener("click", onHeaderClick);
    return pageHeader;
}
export const getHeight = (pageOptions, _headerHeight, _footerHeight) => {
    const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + _headerHeight;
    const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + _footerHeight;
    const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
    return {
        _pageHeaderHeight,
        _pageFooterHeight,
        _pageHeight,
    };
};
export const getContentHeight = (editorDom, pageNumber) => {
    const pageBreak = editorDom.querySelector("#pages > .rm-page-break:nth-child(" + pageNumber + ") > .page");
    if (pageBreak) {
        return parseFloat(window.getComputedStyle(pageBreak).marginTop);
    }
    return 0;
};
export const headerClickEvent = (pageNumber, onHeaderClick) => {
    return (event) => {
        onHeaderClick === null || onHeaderClick === void 0 ? void 0 : onHeaderClick({
            event: event,
            pageNumber: pageNumber,
        });
    };
};
export const footerClickEvent = (pageNumber, onFooterClick) => {
    return (event) => {
        onFooterClick === null || onFooterClick === void 0 ? void 0 : onFooterClick({
            event: event,
            pageNumber: pageNumber,
        });
    };
};
