import { Extension } from "@tiptap/core";
import { PageSize } from "./constants";
import { HeaderOptions, FooterOptions, PageNumber, HeaderHeightMap, FooterHeightMap, HeaderClickEvent, FooterClickEvent } from "./types";
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
    initialized: boolean;
}
declare global {
    interface Window {
        __pp_state?: {
            pageCount: number;
            locked: boolean;
            updateCount: number;
            dimensionsKey: string;
            lastCalculationTime: number;
            pendingRecalculation: boolean;
            stableContentHeight: number | null;
            orientationChangeInProgress: boolean;
        };
    }
}
declare function getState(): {
    pageCount: number;
    locked: boolean;
    updateCount: number;
    dimensionsKey: string;
    lastCalculationTime: number;
    pendingRecalculation: boolean;
    stableContentHeight: number | null;
    orientationChangeInProgress: boolean;
};
declare function resetState(): void;
declare function lockForOrientationChange(duration?: number): void;
export { resetState, lockForOrientationChange, getState as getPaginationState };
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
            updateHeaderContent: (left: string, right: string, center?: string, pageNumber?: PageNumber) => ReturnType;
            updateFooterContent: (left: string, right: string, center?: string, pageNumber?: PageNumber) => ReturnType;
            prepareForOrientationChange: () => ReturnType;
        };
    }
    interface Storage {
        PaginationPlus: PaginationPlusStorage;
    }
}
export declare const PaginationPlus: Extension<PaginationPlusOptions, PaginationPlusStorage>;
