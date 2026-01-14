import { PaginationPlusOptions } from "./PaginationPlus";
import { PageSize } from "./constants";
import { FooterClickEvent, FooterOptions, HeaderClickEvent, HeaderOptions, PageNumber } from "./types";
export declare const updateCssVariables: (targetNode: HTMLElement, config: PaginationPlusOptions) => void;
export declare const getPageSize: (height: number, width: number, marginTop: number, marginBottom: number, marginLeft: number, marginRight: number) => PageSize;
export declare const getHeaderHeight: (targetNode: HTMLElement, pageNumbers: PageNumber[], type: "actual" | "content") => Map<number, number>;
export declare const getHeaderHeightSelector: (pageNumber: PageNumber, type: "actual" | "content") => string;
export declare const getFooterHeight: (targetNode: HTMLElement, pageNumbers: PageNumber[], type: "actual" | "content") => Map<number, number>;
export declare const getFooterHeightSelector: (pageNumber: PageNumber, type: "actual" | "content") => string;
export declare function deepEqualIterative(a: any, b: any): boolean;
export declare function mapNumberEqual(a: Map<number, number>, b: Map<number, number>): boolean;
export declare function getCustomPages(customHeader: Record<PageNumber, HeaderOptions>, customFooter: Record<PageNumber, FooterOptions>): number[];
export declare function getFooter(footerRightContent: string, footerLeftContent: string, footerCenterContent: string, // NEW
onFooterClick: (event: MouseEvent) => void, pageNumber?: PageNumber): HTMLDivElement;
export declare function getHeader(headerRightContent: string, headerLeftContent: string, headerCenterContent: string, // NEW
onHeaderClick: (event: MouseEvent) => void, pageNumber?: PageNumber): HTMLDivElement;
export declare const getHeight: (pageOptions: PaginationPlusOptions, _headerHeight: number, _footerHeight: number) => {
    _pageHeaderHeight: number;
    _pageFooterHeight: number;
    _pageHeight: number;
};
export declare const getContentHeight: (editorDom: HTMLElement, pageNumber: PageNumber) => number;
export declare const headerClickEvent: (pageNumber: PageNumber, onHeaderClick?: HeaderClickEvent) => (event: MouseEvent) => void;
export declare const footerClickEvent: (pageNumber: PageNumber, onFooterClick?: FooterClickEvent) => (event: MouseEvent) => void;
