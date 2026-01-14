export interface HeaderOptions {
  headerLeft: string;
  headerRight: string;
  headerCenter?: string; // NEW: Center header support
}

export interface FooterOptions {
  footerLeft: string;
  footerRight: string;
  footerCenter?: string; // NEW: Center footer support
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
