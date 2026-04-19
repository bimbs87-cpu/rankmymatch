/**
 * Brazilian state-level holidays. Year-independent (month/day only).
 * Includes well-known capital/major-city anniversaries that often appear
 * as state-wide observed holidays.
 */

export interface StateHoliday {
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  name: string;
}

export interface UFEntry {
  uf: string;
  label: string;
  holidays: StateHoliday[];
}

export const UF_HOLIDAYS: UFEntry[] = [
  {
    uf: "SP",
    label: "São Paulo (SP)",
    holidays: [
      { month: 1, day: 25, name: "Aniversário de São Paulo" },
      { month: 7, day: 9, name: "Revolução Constitucionalista" },
    ],
  },
  {
    uf: "RJ",
    label: "Rio de Janeiro (RJ)",
    holidays: [
      { month: 4, day: 23, name: "São Jorge" },
      { month: 11, day: 20, name: "Zumbi dos Palmares" },
    ],
  },
  {
    uf: "MG",
    label: "Minas Gerais (MG)",
    holidays: [
      { month: 4, day: 21, name: "Tiradentes (estadual)" },
    ],
  },
  {
    uf: "BA",
    label: "Bahia (BA)",
    holidays: [
      { month: 7, day: 2, name: "Independência da Bahia" },
    ],
  },
  {
    uf: "PE",
    label: "Pernambuco (PE)",
    holidays: [
      { month: 3, day: 6, name: "Revolução Pernambucana" },
    ],
  },
  {
    uf: "CE",
    label: "Ceará (CE)",
    holidays: [
      { month: 3, day: 25, name: "Abolição da Escravidão (CE)" },
    ],
  },
  {
    uf: "RS",
    label: "Rio Grande do Sul (RS)",
    holidays: [
      { month: 9, day: 20, name: "Revolução Farroupilha" },
    ],
  },
  {
    uf: "PR",
    label: "Paraná (PR)",
    holidays: [
      { month: 12, day: 19, name: "Emancipação do Paraná" },
    ],
  },
  {
    uf: "SC",
    label: "Santa Catarina (SC)",
    holidays: [
      { month: 8, day: 11, name: "Criação da Capitania de SC" },
    ],
  },
  {
    uf: "GO",
    label: "Goiás (GO)",
    holidays: [
      { month: 7, day: 26, name: "Pedra Fundamental de Goiânia" },
      { month: 10, day: 28, name: "Servidor Público (GO)" },
    ],
  },
  {
    uf: "DF",
    label: "Distrito Federal (DF)",
    holidays: [
      { month: 4, day: 21, name: "Fundação de Brasília" },
      { month: 11, day: 30, name: "Dia do Evangélico (DF)" },
    ],
  },
  {
    uf: "AM",
    label: "Amazonas (AM)",
    holidays: [
      { month: 9, day: 5, name: "Elevação do Amazonas a Província" },
      { month: 11, day: 20, name: "Consciência Negra (AM)" },
    ],
  },
  {
    uf: "PA",
    label: "Pará (PA)",
    holidays: [
      { month: 8, day: 15, name: "Adesão do Pará à Independência" },
    ],
  },
  {
    uf: "ES",
    label: "Espírito Santo (ES)",
    holidays: [{ month: 10, day: 28, name: "Servidor Público (ES)" }],
  },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Resolve UF holidays against a list of generated ISO dates. */
export function ufHolidaysMatchingDates(
  uf: string,
  dates: string[],
): { iso: string; name: string }[] {
  const entry = UF_HOLIDAYS.find((u) => u.uf === uf);
  if (!entry) return [];
  const dateSet = new Set(dates);
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const matches: { iso: string; name: string }[] = [];
  for (const y of years) {
    for (const h of entry.holidays) {
      const iso = `${y}-${pad(h.month)}-${pad(h.day)}`;
      if (dateSet.has(iso)) matches.push({ iso, name: h.name });
    }
  }
  matches.sort((a, b) => a.iso.localeCompare(b.iso));
  return matches;
}
