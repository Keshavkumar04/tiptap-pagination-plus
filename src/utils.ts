import { PaginationPlusOptions } from "./PaginationPlus";
import { PageSize } from "./constants";
import { FooterClickEvent, FooterHeightMap, FooterOptions, HeaderClickEvent, HeaderHeightMap, HeaderOptions, PageNumber } from "./types";

export const updateCssVariables = (targetNode: HTMLElement, config: PaginationPlusOptions) => {

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
      }

  Object.entries(cssVariables).forEach(([key, value]) => {
    targetNode.style.setProperty(`--${key}`, value);
  });
}


export const getPageSize = (height: number, width: number, marginTop: number, marginBottom: number, marginLeft: number, marginRight: number): PageSize => {
    return {
        pageHeight: height,
        pageWidth: width,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
    }
}

export const getHeaderHeight = (targetNode: HTMLElement, pageNumbers: PageNumber[], type: "actual" | "content") => {
  const headerHeightMap = new Map<PageNumber, number>();

  // Find general header height
  const clientHeader = targetNode.querySelector(getHeaderHeightSelector(0, type));
  headerHeightMap.set(0, clientHeader ? clientHeader.clientHeight : 0);
  
  // Find header height for each page number
  pageNumbers.forEach(pageNumber => {
    const clientHeader = targetNode.querySelector(getHeaderHeightSelector(pageNumber, type));
    const headerHeight = clientHeader ? clientHeader.clientHeight : 0;
    headerHeightMap.set(pageNumber, headerHeight);
  });

  return headerHeightMap;
}

export const getHeaderHeightSelector = (pageNumber: PageNumber, type: "actual" | "content") => {
  return type === "actual" ? `.rm-page-header-${pageNumber}` : `.rm-page-header-${pageNumber} .rm-page-header-content`;
}

export const getFooterHeight = (targetNode: HTMLElement, pageNumbers: PageNumber[], type: "actual" | "content") => {
  const footerHeightMap = new Map<PageNumber, number>();
  
  // Find general footer height
  const clientFooter = targetNode.querySelector(getFooterHeightSelector(0, type));
  footerHeightMap.set(0, clientFooter ? clientFooter.clientHeight : 0);
  
  // Find footer height for each page number
  pageNumbers.forEach(pageNumber => {
    const clientFooter = targetNode.querySelector(getFooterHeightSelector(pageNumber, type));
    const footerHeight = clientFooter ? clientFooter.clientHeight : 0;
    footerHeightMap.set(pageNumber, footerHeight);
  });

  return footerHeightMap;
}

export const getFooterHeightSelector = (pageNumber: PageNumber, type: "actual" | "content") => {
  return type === "actual" ? `.rm-page-footer-${pageNumber}` : `.rm-page-footer-${pageNumber} .rm-page-footer-content`;
}

export function deepEqualIterative(a: any, b: any): boolean {
  // Quick reference check
  if (a === b) return true;

  // One is null or type mismatch
  if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) {
      return false;
  }

  // Stack for iterative traversal
  const stack = [{ x: a, y: b }];

  while (stack.length) {
      const _stackItem = stack.pop();
      if (!_stackItem) continue;
      const { x, y } = _stackItem;

      // If primitive mismatch
      if (x === y) continue;
      if (typeof x !== typeof y) return false;
      if (typeof x !== "object") return false;

      if (x == null || y == null) return false;

      const xKeys = Object.keys(x);
      const yKeys = Object.keys(y);

      // Length mismatch
      if (xKeys.length !== yKeys.length) return false;

      // Check keys
      for (const key of xKeys) {
          if (!(key in y)) return false;

          const xVal = x[key];
          const yVal = y[key];

          // Same reference — skip
          if (xVal === yVal) continue;

          // Push nested objects/arrays to stack
          if (typeof xVal === "object" && typeof yVal === "object") {
              stack.push({ x: xVal, y: yVal });
          } else {
              // Primitive compare
              if (xVal !== yVal) return false;
          }
      }
  }

  return true;
}

export function mapNumberEqual(a: Map<number, number>, b: Map<number, number>) {
  if ((!(a instanceof Map)) || (!(b instanceof Map)) || a.size !== b.size) return false;

  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

export function getCustomPages(customHeader: Record<PageNumber, HeaderOptions>, customFooter: Record<PageNumber, FooterOptions>) {
  return [...Object.keys(customHeader), ...Object.keys(customFooter)].map(Number);
}


export function getFooter(footerRightContent: string, footerLeftContent: string, onFooterClick: (event: MouseEvent) => void, pageNumber?: PageNumber) {
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

  const footerRight = footerRightContent.replace(
    "{page}",
    `<span class="rm-page-number"></span>`
  );
  const footerLeft = footerLeftContent.replace(
    "{page}",
    `<span class="rm-page-number"></span>`
  );

  const pageFooterLeft = document.createElement("div");
  pageFooterLeft.classList.add("rm-page-footer-left");
  pageFooterLeft.innerHTML = footerLeft;

  const pageFooterRight = document.createElement("div");
  pageFooterRight.classList.add("rm-page-footer-right");
  pageFooterRight.innerHTML = footerRight;

  pageFooterContent.append(pageFooterLeft, pageFooterRight);

  pageFooter.append(pageFooterContent);

  pageFooter.addEventListener("click", onFooterClick);

  return pageFooter;
}

export function getHeader(headerRightContent: string, headerLeftContent: string, onHeaderClick: (event: MouseEvent) => void, pageNumber?: PageNumber) {
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

      const headerLeft = headerLeftContent.replace(
        "{page}",
        `<span class="rm-page-number-plus"></span>`
      );
      const headerRight = headerRightContent.replace(
        "{page}",
        `<span class="rm-page-number-plus"></span>`
      );

      const pageHeaderLeft = document.createElement("div");
      pageHeaderLeft.classList.add("rm-page-header-left");
      pageHeaderLeft.innerHTML = headerLeft;

      const pageHeaderRight = document.createElement("div");
      pageHeaderRight.classList.add("rm-page-header-right");
      pageHeaderRight.innerHTML = headerRight;

      pageHeaderContent.append(pageHeaderLeft, pageHeaderRight);
      pageHeader.append(pageHeaderContent);

        pageHeader.addEventListener("click", onHeaderClick);


      return pageHeader;
}

export const getHeight = (pageOptions: PaginationPlusOptions, _headerHeight: number, _footerHeight: number) => {
  const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + _headerHeight;
  const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + _footerHeight;
  const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight;
  return {
    _pageHeaderHeight,
    _pageFooterHeight,
    _pageHeight,
  }
}

export const getContentHeight = (editorDom: HTMLElement, pageNumber: PageNumber) => {

  const pageBreak = editorDom.querySelector('#pages > .rm-page-break:nth-child(' + pageNumber + ') > .page');
  if(pageBreak) {
    return parseFloat(window.getComputedStyle(pageBreak).marginTop);
  }
  return 0;

}

export const headerClickEvent = (pageNumber: PageNumber, onHeaderClick?: HeaderClickEvent) => {
  return (event: MouseEvent) => {
    onHeaderClick?.({
      event: event,
      pageNumber: pageNumber
    });
  }
}

export const footerClickEvent = (pageNumber: PageNumber, onFooterClick?: FooterClickEvent) => {
  return (event: MouseEvent) => {
    onFooterClick?.({
      event: event,
      pageNumber: pageNumber
    });
  }
}