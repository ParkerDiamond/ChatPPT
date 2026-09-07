export type ElementKind = "textbox" | "shape" | "line" | "table" | "chart" | "image";

export type ChartSpec = {
  kind: "column" | "bar" | "line" | "pie" | "doughnut" | "area";
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  title?: string;
};

export type ElementRecord = {
  id: string;
  kind: ElementKind;
  preset?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: "left" | "center" | "right" | "justify";
  rows?: string[][];
  chartSpec?: ChartSpec;
  imagePath?: string;
  createdAt: string;
  updatedAt: string;
};

export type SlideRecord = {
  id: string;
  title?: string;
  notes?: string;
  elements: ElementRecord[];
};

export type SlideCollection = {
  id: string;
  name: string;
  description?: string;
  slideIds: string[];
};

export type DeckRecord = {
  id: string;
  title?: string;
  fileName: string;
  revision: number;
  slides: SlideRecord[];
  collections: SlideCollection[];
  createdAt: string;
  updatedAt: string;
};

export type Registry = { decks: DeckRecord[] };