/* What every page gives the shell: its heading, where it sits, buttons beside the heading, and its body. */
export type Page = { title: string; kicker: string; crumbs: [string, string][]; actions: string; body: string };
