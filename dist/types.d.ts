export interface HeaderOptions {
    headerLeft: string;
    headerRight: string;
    headerCenter?: string;
}
export interface FooterOptions {
    footerLeft: string;
    footerRight: string;
    footerCenter?: string;
}
export type PageNumber = number;
export type HeaderHeightMap = Map<PageNumber, number>;
export type FooterHeightMap = Map<PageNumber, number>;
export type HeaderClickEvent = (params: {
    event: MouseEvent;
    pageNumber: PageNumber;
}) => void;
export type FooterClickEvent = (params: {
    event: MouseEvent;
    pageNumber: PageNumber;
}) => void;
