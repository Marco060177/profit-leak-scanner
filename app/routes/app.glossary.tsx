import * as React from "react";
import { useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

type Language = "it" | "en";

type GlossaryCategory =
  | "profit"
  | "costs"
  | "products"
  | "recovery"
  | "forecast"
  | "actions"
  | "scores"
  | "tax"
  | "data";

type GlossaryTerm = {
  id: string;
  term: string;
  category: GlossaryCategory;
  short: {
    it: string;
    en: string;
  };
  detail: {
    it: string;
    en: string;
  };
  related?: string[];
};

const CATEGORY_CONFIG: Record<
  GlossaryCategory,
  {
    it: string;
    en: string;
    color: string;
    background: string;
    border: string;
  }
> = {
  profit: {
    it: "Profitto & Margini",
    en: "Profit & Margin",
    color: "#4ade80",
    background: "rgba(34,197,94,0.09)",
    border: "rgba(34,197,94,0.22)",
  },
  costs: {
    it: "Costi",
    en: "Costs",
    color: "#f59e0b",
    background: "rgba(245,158,11,0.09)",
    border: "rgba(245,158,11,0.22)",
  },
  products: {
    it: "Prodotti",
    en: "Products",
    color: "#fb7185",
    background: "rgba(251,113,133,0.09)",
    border: "rgba(251,113,133,0.22)",
  },
  recovery: {
    it: "Recovery",
    en: "Recovery",
    color: "#38bdf8",
    background: "rgba(56,189,248,0.09)",
    border: "rgba(56,189,248,0.22)",
  },
  forecast: {
    it: "Forecasting",
    en: "Forecasting",
    color: "#a78bfa",
    background: "rgba(167,139,250,0.09)",
    border: "rgba(167,139,250,0.22)",
  },
  actions: {
    it: "Azioni",
    en: "Actions",
    color: "#ff8a5c",
    background: "rgba(255,115,60,0.09)",
    border: "rgba(255,115,60,0.22)",
  },
  scores: {
    it: "Score & Affidabilità",
    en: "Scores & Confidence",
    color: "#c084fc",
    background: "rgba(192,132,252,0.09)",
    border: "rgba(192,132,252,0.22)",
  },
  tax: {
    it: "Tax & VAT",
    en: "Tax & VAT",
    color: "#2dd4bf",
    background: "rgba(45,212,191,0.09)",
    border: "rgba(45,212,191,0.22)",
  },
  data: {
    it: "Dati Shopify",
    en: "Shopify Data",
    color: "#94a3b8",
    background: "rgba(148,163,184,0.09)",
    border: "rgba(148,163,184,0.20)",
  },
};

const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "action-score",
    term: "Action Score",
    category: "scores",
    short: {
      it: "Punteggio sintetico che misura quanto lavoro operativo rilevante MarginLab ha individuato.",
      en: "Summary score indicating how much relevant operational work MarginLab has identified.",
    },
    detail: {
      it: "Combina numero di azioni disponibili, valore economico potenziale e priorità media. Un valore elevato non indica che lo store è necessariamente in cattive condizioni: indica che esistono decisioni con impatto che meritano attenzione.",
      en: "Combines available actions, potential economic value and average priority. A high score does not necessarily mean the store is unhealthy; it means meaningful decisions deserve attention.",
    },
    related: ["Priority", "Profit Action Center"],
  },
  {
    id: "annual-impact",
    term: "Annual Impact",
    category: "recovery",
    short: {
      it: "Proiezione su 12 mesi dell'impatto economico stimato.",
      en: "12-month projection of an estimated economic impact.",
    },
    detail: {
      it: "È normalmente ottenuto annualizzando uno scenario mensile. Non rappresenta profitto già realizzato e presuppone che le condizioni dello scenario restino valide.",
      en: "Usually calculated by annualizing a monthly scenario. It is not realized profit and assumes scenario conditions remain valid.",
    },
  },
  {
    id: "annual-net-profit",
    term: "Annual Net Profit",
    category: "profit",
    short: {
      it: "Profitto netto annualizzato derivato dalla base mensile del modello.",
      en: "Annualized net profit derived from the model's monthly baseline.",
    },
    detail: {
      it: "MarginLab lo utilizza come proiezione economica, non come risultato contabile storico.",
      en: "MarginLab uses it as an economic projection, not as a historical accounting result.",
    },
  },
  {
    id: "average-margin",
    term: "Average Margin",
    category: "profit",
    short: {
      it: "Margine medio calcolato sull'insieme di ricavi e profitto considerati.",
      en: "Average margin calculated across the revenue and profit being analyzed.",
    },
    detail: {
      it: "Nel Forecasting può riferirsi al margine medio previsto sull'intero orizzonte selezionato.",
      en: "In Forecasting, it may refer to the average projected margin across the entire selected horizon.",
    },
  },
  {
    id: "baseline",
    term: "Baseline",
    category: "data",
    short: {
      it: "Situazione economica di partenza usata come riferimento.",
      en: "Starting economic position used as a reference.",
    },
    detail: {
      it: "In MarginLab la baseline deriva dai dati Shopify del periodo selezionato e, quando necessario, viene normalizzata su base mensile.",
      en: "In MarginLab, the baseline comes from Shopify data for the selected period and may be normalized to a monthly basis.",
    },
  },
  {
    id: "break-even-price",
    term: "Break-even Price",
    category: "profit",
    short: {
      it: "Prezzo minimo necessario affinché il prodotto copra i costi considerati.",
      en: "Minimum price required for a product to cover the costs being considered.",
    },
    detail: {
      it: "Sotto questo prezzo il prodotto non genera profitto economico secondo la struttura dei costi utilizzata dal modello.",
      en: "Below this price, the product does not generate economic profit under the model's cost structure.",
    },
  },
  {
    id: "break-even-revenue",
    term: "Break-even Revenue",
    category: "profit",
    short: {
      it: "Ricavi necessari per arrivare a profitto zero.",
      en: "Revenue required to reach zero profit.",
    },
    detail: {
      it: "È il livello di ricavi mensili stimato necessario per coprire costi fissi e variabili configurati. Oltre questo livello il modello inizia a generare profitto.",
      en: "Estimated monthly revenue needed to cover configured fixed and variable costs. Above this level, the model begins to generate profit.",
    },
  },
  {
    id: "business-tax-reserve",
    term: "Business Tax Reserve",
    category: "tax",
    short: {
      it: "Riserva prudenziale gestionale utilizzata nel modello economico.",
      en: "Managerial reserve used as a conservative economic assumption.",
    },
    detail: {
      it: "Non sostituisce IVA, GST, Sales Tax, dichiarazioni fiscali o imposte effettivamente dovute. È una semplice assunzione finanziaria del Business Model Studio.",
      en: "It does not replace VAT, GST, Sales Tax, tax filings or actual tax liabilities. It is a financial assumption used by Business Model Studio.",
    },
  },
  {
    id: "cogs",
    term: "COGS",
    category: "costs",
    short: {
      it: "Cost of Goods Sold: costo dei prodotti effettivamente venduti.",
      en: "Cost of Goods Sold: cost of the products actually sold.",
    },
    detail: {
      it: "È una delle basi principali del calcolo di profitto e margine. In MarginLab può essere rettificato economicamente dal Tax Engine quando la configurazione fiscale lo richiede.",
      en: "A core component of profit and margin calculations. MarginLab may economically adjust it through the Tax Engine when tax configuration requires it.",
    },
  },
  {
    id: "cogs-coverage",
    term: "COGS Coverage",
    category: "data",
    short: {
      it: "Percentuale dei dati analizzati per cui MarginLab dispone di informazioni di costo utilizzabili.",
      en: "Percentage of analyzed data for which MarginLab has usable cost information.",
    },
    detail: {
      it: "Una copertura elevata rende più solide le analisi di profitto. Costi mancanti possono ridurre l'affidabilità delle stime.",
      en: "Higher coverage strengthens profit analysis. Missing costs can reduce estimate reliability.",
    },
  },
  {
    id: "commercial-risk",
    term: "Commercial Risk",
    category: "scores",
    short: {
      it: "Stima del rischio commerciale associato a uno scenario.",
      en: "Estimate of the commercial risk associated with a scenario.",
    },
    detail: {
      it: "Nel Recovery Simulator considera soprattutto variazioni di prezzo e possibile risposta delle vendite. Non è una previsione statistica della domanda.",
      en: "In Recovery Simulator, it mainly considers price changes and possible sales response. It is not a statistical demand forecast.",
    },
  },
  {
    id: "confidence",
    term: "Confidence",
    category: "scores",
    short: {
      it: "Indicatore della solidità dei dati usati da una stima.",
      en: "Indicator of the strength of the data supporting an estimate.",
    },
    detail: {
      it: "Non rappresenta la probabilità che il risultato economico previsto si realizzi. Valuta invece elementi come disponibilità dei costi, copertura e storico utilizzabile.",
      en: "It does not represent the probability that a projected economic result will happen. It evaluates factors such as cost availability, coverage and usable history.",
    },
  },
  {
    id: "contribution-margin",
    term: "Contribution Margin",
    category: "profit",
    short: {
      it: "Margine disponibile dopo i costi variabili per contribuire alla copertura dei costi fissi.",
      en: "Margin remaining after variable costs to help cover fixed costs.",
    },
    detail: {
      it: "È utile per capire quanto ogni euro di ricavi contribuisce realmente alla struttura economica dello store.",
      en: "Useful for understanding how much each unit of revenue contributes to the store's economic structure.",
    },
  },
  {
    id: "cumulative-profit",
    term: "Cumulative Profit",
    category: "forecast",
    short: {
      it: "Somma del profitto generato durante più periodi consecutivi.",
      en: "Sum of profit generated across multiple consecutive periods.",
    },
    detail: {
      it: "Nel Forecasting rappresenta il profitto totale previsto accumulato durante l'orizzonte selezionato.",
      en: "In Forecasting, it represents total projected profit accumulated across the selected horizon.",
    },
  },
  {
    id: "cumulative-profit-lift",
    term: "Cumulative Profit Lift",
    category: "forecast",
    short: {
      it: "Profitto aggiuntivo cumulativo dello scenario rispetto alla situazione attuale.",
      en: "Cumulative additional profit generated by a scenario versus today's baseline.",
    },
    detail: {
      it: "È la differenza tra il profitto previsto dallo scenario e quello che si otterrebbe mantenendo invariato l'attuale profitto mensile.",
      en: "Difference between scenario profit and the profit that would result from keeping current monthly profit unchanged.",
    },
  },
  {
    id: "data-quality",
    term: "Data Quality",
    category: "scores",
    short: {
      it: "Valutazione della completezza e affidabilità dei dati utilizzati dal modello.",
      en: "Assessment of the completeness and reliability of data used by the model.",
    },
    detail: {
      it: "Non misura la probabilità di successo dello scenario. Misura la qualità della base informativa su cui MarginLab sta lavorando.",
      en: "It does not measure scenario success probability. It measures the quality of the information MarginLab is working with.",
    },
  },
  {
    id: "default-tax-rate",
    term: "Default Tax Rate",
    category: "tax",
    short: {
      it: "Aliquota fiscale di fallback usata quando non è disponibile una tax line più specifica.",
      en: "Fallback tax rate used when a more specific tax line is unavailable.",
    },
    detail: {
      it: "Le tax line Shopify reali hanno priorità. L'aliquota predefinita non sovrascrive automaticamente le imposte registrate sugli ordini.",
      en: "Actual Shopify tax lines take priority. The default rate does not automatically override taxes recorded on orders.",
    },
  },
  {
    id: "discount-exposure",
    term: "Discount Exposure",
    category: "profit",
    short: {
      it: "Misura quanto sconti e promozioni stanno incidendo sulla redditività.",
      en: "Measure of how discounts and promotions affect profitability.",
    },
    detail: {
      it: "Aiuta a distinguere crescita dei ricavi da crescita realmente profittevole.",
      en: "Helps distinguish revenue growth from genuinely profitable growth.",
    },
  },
  {
    id: "economic-cogs",
    term: "Economic COGS",
    category: "costs",
    short: {
      it: "Costo economico dei prodotti dopo eventuali rettifiche fiscali applicabili.",
      en: "Economic product cost after applicable tax adjustments.",
    },
    detail: {
      it: "Può differire dal costo Shopify grezzo quando l'imposta sugli acquisti è inclusa e recuperabile.",
      en: "May differ from raw Shopify cost when input tax is included and recoverable.",
    },
  },
  {
    id: "economic-margin",
    term: "Economic Margin",
    category: "profit",
    short: {
      it: "Margine calcolato sulla base economica effettivamente usata da MarginLab.",
      en: "Margin calculated using the economic basis actually used by MarginLab.",
    },
    detail: {
      it: "Tiene conto delle rettifiche necessarie per rappresentare correttamente ricavi e costi economici.",
      en: "Reflects adjustments needed to represent economic revenue and costs correctly.",
    },
  },
  {
    id: "economic-profit",
    term: "Economic Profit",
    category: "profit",
    short: {
      it: "Profitto calcolato dopo aver ricostruito ricavi e costi sulla base economica MarginLab.",
      en: "Profit calculated after reconstructing revenue and costs on MarginLab's economic basis.",
    },
    detail: {
      it: "È la base utilizzata da molte funzioni Growth prima di applicare ulteriori costi o assunzioni.",
      en: "Used by many Growth features before additional costs or assumptions are applied.",
    },
  },
  {
    id: "economic-revenue",
    term: "Economic Revenue",
    category: "profit",
    short: {
      it: "Ricavi utilizzati da MarginLab per misurare la redditività economica.",
      en: "Revenue used by MarginLab to measure economic profitability.",
    },
    detail: {
      it: "Può differire dai ricavi lordi Shopify quando è necessario separare componenti fiscali.",
      en: "May differ from gross Shopify revenue when tax components need to be separated.",
    },
  },
  {
    id: "estimated-profit-model",
    term: "Estimated Profit Model",
    category: "profit",
    short: {
      it: "Ricostruzione del profitto che combina dati osservati e ipotesi del merchant.",
      en: "Profit model combining observed data and merchant assumptions.",
    },
    detail: {
      it: "Nel Business Model Studio include costi fissi, commissioni variabili e riserve configurate. Non è un conto economico contabile ufficiale.",
      en: "In Business Model Studio it includes configured fixed costs, variable fees and reserves. It is not an official accounting P&L.",
    },
  },
  {
    id: "estimated-timing",
    term: "Estimated Timing",
    category: "forecast",
    short: {
      it: "Primo periodo in cui uno scenario raggiunge un obiettivo configurato.",
      en: "First period in which a scenario reaches a configured target.",
    },
    detail: {
      it: "Dipende interamente dalle ipotesi dello scenario e non rappresenta una data garantita.",
      en: "Depends entirely on scenario assumptions and is not a guaranteed date.",
    },
  },
  {
    id: "fixed-costs",
    term: "Fixed Costs",
    category: "costs",
    short: {
      it: "Costi che il modello considera indipendenti dal volume delle singole vendite.",
      en: "Costs the model treats as independent from individual sales volume.",
    },
    detail: {
      it: "Esempi tipici sono advertising mensile, software, personale e altri costi operativi inseriti nel Business Model Studio.",
      en: "Typical examples include monthly advertising, software, staff and other operating costs entered in Business Model Studio.",
    },
  },
  {
    id: "forecast-health",
    term: "Forecast Health",
    category: "forecast",
    short: {
      it: "Valutazione sintetica della solidità economica dello scenario futuro.",
      en: "Summary assessment of the economic strength of a future scenario.",
    },
    detail: {
      it: "In MarginLab deriva principalmente dal margine netto previsto al termine dell'orizzonte selezionato.",
      en: "In MarginLab, it is primarily based on projected net margin at the end of the selected horizon.",
    },
  },
  {
    id: "gross-margin",
    term: "Gross Margin",
    category: "profit",
    short: {
      it: "Percentuale di ricavi che rimane dopo il costo dei prodotti venduti.",
      en: "Percentage of revenue remaining after the cost of goods sold.",
    },
    detail: {
      it: "Formula semplificata: (Ricavi − COGS) / Ricavi × 100.",
      en: "Simplified formula: (Revenue − COGS) / Revenue × 100.",
    },
  },
  {
    id: "gross-profit",
    term: "Gross Profit",
    category: "profit",
    short: {
      it: "Ricavi meno costo dei prodotti venduti.",
      en: "Revenue minus cost of goods sold.",
    },
    detail: {
      it: "Non considera necessariamente advertising, software, personale, commissioni o altri costi operativi.",
      en: "Does not necessarily include advertising, software, staff, fees or other operating expenses.",
    },
  },
  {
    id: "input-tax-recovery",
    term: "Input Tax Recovery",
    category: "tax",
    short: {
      it: "Quota dell'imposta inclusa nei costi considerata economicamente recuperabile.",
      en: "Share of tax embedded in costs treated as economically recoverable.",
    },
    detail: {
      it: "Serve a ricostruire il costo economico. Non determina il diritto fiscale effettivo del merchant alla detrazione.",
      en: "Used to reconstruct economic cost. It does not determine the merchant's actual legal right to recover tax.",
    },
  },
  {
    id: "low-margin-product",
    term: "Low-Margin Product",
    category: "products",
    short: {
      it: "Prodotto con margine inferiore alla soglia economica utilizzata da MarginLab.",
      en: "Product with margin below the economic threshold used by MarginLab.",
    },
    detail: {
      it: "Non significa necessariamente prodotto da eliminare: può richiedere revisione di prezzo, costo, sconti o ruolo commerciale.",
      en: "Does not necessarily mean the product should be removed; pricing, cost, discounting or strategic role may need review.",
    },
  },
  {
    id: "margin-deterioration",
    term: "Margin Deterioration",
    category: "profit",
    short: {
      it: "Riduzione del margine rispetto a un periodo di confronto.",
      en: "Decline in margin versus a comparison period.",
    },
    detail: {
      it: "Può indicare aumento dei costi, maggiore pressione promozionale, cambiamento del mix prodotti o altri fenomeni da approfondire.",
      en: "May indicate rising costs, heavier discounting, product-mix changes or other issues requiring investigation.",
    },
  },
  {
    id: "margin-improvement",
    term: "Margin Improvement",
    category: "forecast",
    short: {
      it: "Aumento ipotizzato del margine durante uno scenario.",
      en: "Assumed increase in margin during a scenario.",
    },
    detail: {
      it: "Nel Forecasting viene espresso in punti percentuali e applicato progressivamente lungo l'orizzonte scelto.",
      en: "In Forecasting, it is expressed in percentage points and applied progressively across the selected horizon.",
    },
  },
  {
    id: "missing-cost",
    term: "Missing Cost",
    category: "data",
    short: {
      it: "Prodotto per cui manca un costo utilizzabile.",
      en: "Product for which usable cost data is missing.",
    },
    detail: {
      it: "Senza costo, MarginLab non può misurare con la stessa precisione profitto e margine del prodotto.",
      en: "Without cost data, MarginLab cannot measure product profit and margin with the same precision.",
    },
  },
  {
    id: "model-health",
    term: "Model Health",
    category: "scores",
    short: {
      it: "Punteggio sintetico della sostenibilità del modello economico.",
      en: "Summary score of the sustainability of the economic model.",
    },
    detail: {
      it: "Considera margine netto stimato, peso dei costi e concentrazione delle principali voci di costo.",
      en: "Considers estimated net margin, cost burden and concentration of major cost items.",
    },
  },
  {
    id: "monthly-net-profit",
    term: "Monthly Net Profit",
    category: "profit",
    short: {
      it: "Profitto netto stimato su base mensile.",
      en: "Estimated net profit on a monthly basis.",
    },
    detail: {
      it: "Il significato preciso dipende dal modulo: può includere costi fissi, commissioni variabili e riserve gestionali oltre alla base economica dello store.",
      en: "Exact meaning depends on the module and may include fixed costs, variable fees and business reserves in addition to the store's economic baseline.",
    },
  },
  {
    id: "monthly-profit-gap",
    term: "Monthly Profit Gap to Target",
    category: "recovery",
    short: {
      it: "Differenza mensile stimata tra la situazione attuale e uno scenario target.",
      en: "Estimated monthly difference between the current situation and a target scenario.",
    },
    detail: {
      it: "È un'opportunità economica modellata, non profitto già perso o garantito.",
      en: "It is a modeled economic opportunity, not already lost or guaranteed profit.",
    },
  },
  {
    id: "net-margin",
    term: "Net Margin",
    category: "profit",
    short: {
      it: "Percentuale di ricavi che rimane come profitto netto dopo i costi considerati.",
      en: "Percentage of revenue remaining as net profit after included costs.",
    },
    detail: {
      it: "È una misura più completa del gross margin quando il modello include costi operativi e commissioni.",
      en: "A more complete profitability measure than gross margin when operating costs and fees are included.",
    },
  },
  {
    id: "net-monthly-recovery",
    term: "Net Monthly Recovery",
    category: "recovery",
    short: {
      it: "Incremento mensile netto stimato prodotto dallo scenario rispetto alla baseline.",
      en: "Estimated monthly net improvement generated by a scenario versus baseline.",
    },
    detail: {
      it: "È un risultato simulato. Non rappresenta denaro già recuperato.",
      en: "It is a simulated result and does not represent money already recovered.",
    },
  },
  {
    id: "opportunity",
    term: "Opportunity",
    category: "actions",
    short: {
      it: "Area in cui MarginLab individua un potenziale miglioramento economico.",
      en: "Area where MarginLab identifies potential economic improvement.",
    },
    detail: {
      it: "Un'opportunità non è necessariamente un problema: indica una possibile leva di ottimizzazione.",
      en: "An opportunity is not necessarily a problem; it indicates a possible optimization lever.",
    },
  },
  {
    id: "priority",
    term: "Priority",
    category: "actions",
    short: {
      it: "Indicatore utilizzato per ordinare le attività in base a rilevanza e urgenza.",
      en: "Indicator used to rank actions by relevance and urgency.",
    },
    detail: {
      it: "Aiuta a distinguere ciò che merita attenzione immediata da ciò che può essere pianificato o semplicemente monitorato.",
      en: "Helps distinguish what needs immediate attention from what can be planned or simply monitored.",
    },
  },
  {
    id: "profit-action-center",
    term: "Profit Action Center",
    category: "actions",
    short: {
      it: "Area MarginLab che trasforma segnali economici in una coda ordinata di azioni.",
      en: "MarginLab area that turns economic signals into an ordered action queue.",
    },
    detail: {
      it: "Non somma automaticamente tutti gli impatti delle singole azioni perché alcune opportunità possono sovrapporsi.",
      en: "It does not automatically add all individual action impacts because some opportunities can overlap.",
    },
  },
  {
    id: "profit-health",
    term: "Profit Health",
    category: "scores",
    short: {
      it: "Classificazione sintetica del livello di margine raggiunto.",
      en: "Summary classification of the margin level achieved.",
    },
    detail: {
      it: "Nel Recovery Simulator può classificare lo scenario come in perdita, critico, debole, solido o forte.",
      en: "In Recovery Simulator, it may classify a scenario as loss-making, critical, weak, healthy or strong.",
    },
  },
  {
    id: "profit-leak",
    term: "Profit Leak",
    category: "profit",
    short: {
      it: "Situazione in cui ricavi o vendite non si trasformano nel profitto economico atteso.",
      en: "Situation where revenue or sales fail to convert into expected economic profit.",
    },
    detail: {
      it: "Può derivare da costo elevato, prezzo debole, sconti, rimborsi, commissioni o altri fattori.",
      en: "May result from high costs, weak pricing, discounts, refunds, fees or other factors.",
    },
  },
  {
    id: "recoverable-profit",
    term: "Recoverable Profit",
    category: "recovery",
    short: {
      it: "Profitto potenziale che potrebbe essere recuperato migliorando una situazione economica identificata.",
      en: "Potential profit that may be recovered by improving an identified economic situation.",
    },
    detail: {
      it: "È una stima di opportunità e non deve essere interpretata come profitto garantito.",
      en: "It is an opportunity estimate and should not be interpreted as guaranteed profit.",
    },
  },
  {
    id: "recovery-opportunities-captured",
    term: "Recovery Opportunities Captured",
    category: "forecast",
    short: {
      it: "Quota del profitto recuperabile che uno scenario assume di riuscire a realizzare.",
      en: "Share of recoverable profit a scenario assumes will be realized.",
    },
    detail: {
      it: "Il 100% significa utilizzare l'intera opportunità stimata nel modello, non garantire il recupero effettivo del 100%.",
      en: "100% means modeling the full estimated opportunity, not guaranteeing that 100% will actually be recovered.",
    },
  },
  {
    id: "refund-exposure",
    term: "Refund Exposure",
    category: "profit",
    short: {
      it: "Misura dell'impatto economico dei rimborsi sulla redditività.",
      en: "Measure of the economic impact of refunds on profitability.",
    },
    detail: {
      it: "Aiuta a individuare prodotti o periodi in cui i rimborsi stanno erodendo il profitto.",
      en: "Helps identify products or periods where refunds are eroding profit.",
    },
  },
  {
    id: "revenue-growth",
    term: "Revenue Growth",
    category: "forecast",
    short: {
      it: "Variazione dei ricavi nel tempo.",
      en: "Change in revenue over time.",
    },
    detail: {
      it: "Nel Forecasting è un'ipotesi dello scenario, non necessariamente una crescita già osservata.",
      en: "In Forecasting, it is a scenario assumption, not necessarily observed growth.",
    },
  },
  {
    id: "scenario",
    term: "Scenario",
    category: "forecast",
    short: {
      it: "Combinazione di ipotesi utilizzata per simulare un possibile risultato economico.",
      en: "Combination of assumptions used to simulate a possible economic outcome.",
    },
    detail: {
      it: "Gli scenari servono per prendere decisioni. Non sono previsioni garantite e scenari alternativi non devono essere sommati.",
      en: "Scenarios support decision-making. They are not guaranteed forecasts and alternative scenarios should not be added together.",
    },
  },
  {
    id: "tax-aware-economic-basis",
    term: "Tax-aware Economic Basis",
    category: "tax",
    short: {
      it: "Base economica che tiene conto del trattamento fiscale disponibile nei dati Shopify e nel Tax Profile.",
      en: "Economic basis incorporating available tax treatment from Shopify data and the Tax Profile.",
    },
    detail: {
      it: "Serve a evitare che componenti fiscali vengano interpretate impropriamente come ricavo, costo o profitto economico.",
      en: "Helps prevent tax components from being incorrectly treated as economic revenue, cost or profit.",
    },
  },
  {
    id: "tax-lines",
    term: "Tax Lines",
    category: "tax",
    short: {
      it: "Dettaglio delle imposte registrate da Shopify sulle transazioni.",
      en: "Tax details recorded by Shopify on transactions.",
    },
    detail: {
      it: "Quando disponibili, MarginLab le considera una fonte prioritaria rispetto alle aliquote di fallback configurate nel Tax Profile.",
      en: "When available, MarginLab treats them as authoritative over fallback rates configured in the Tax Profile.",
    },
  },
  {
    id: "target-margin",
    term: "Target Margin",
    category: "profit",
    short: {
      it: "Livello di margine utilizzato come obiettivo economico in una simulazione o analisi.",
      en: "Margin level used as an economic target in analysis or simulation.",
    },
    detail: {
      it: "Non rappresenta necessariamente il margine ideale universale dello store: è una soglia operativa utilizzata dal modello.",
      en: "It does not necessarily represent a universally ideal store margin; it is an operational threshold used by the model.",
    },
  },
  {
    id: "variable-fees",
    term: "Variable Fees",
    category: "costs",
    short: {
      it: "Commissioni che aumentano o diminuiscono in funzione dei ricavi o delle transazioni.",
      en: "Fees that rise or fall with revenue or transaction volume.",
    },
    detail: {
      it: "Esempi tipici sono payment processing fees e transaction fees.",
      en: "Typical examples include payment processing fees and transaction fees.",
    },
  },
  {
    id: "weak-best-seller",
    term: "Weak Best Seller",
    category: "products",
    short: {
      it: "Prodotto con vendite rilevanti ma redditività relativamente debole.",
      en: "High-selling product with relatively weak profitability.",
    },
    detail: {
      it: "È particolarmente importante perché un prodotto molto venduto può generare ricavi elevati senza contribuire altrettanto al profitto.",
      en: "Especially important because a high-selling product can generate substantial revenue without contributing proportionally to profit.",
    },
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function GlossaryPage() {
  const navigate = useNavigate();
  const language: Language =
    getStoredLanguage() === "it" ? "it" : "en";

  const [query, setQuery] = React.useState("");
  const [category, setCategory] =
    React.useState<GlossaryCategory | "all">("all");
  const [expandedId, setExpandedId] =
    React.useState<string | null>(null);

  const filteredTerms = React.useMemo(() => {
    const normalizedQuery = normalize(query.trim());

    return [...GLOSSARY_TERMS]
      .filter((item) => {
        if (category !== "all" && item.category !== category) {
          return false;
        }

        if (!normalizedQuery) return true;

        const searchable = normalize(
          [
            item.term,
            item.short.it,
            item.short.en,
            item.detail.it,
            item.detail.en,
            ...(item.related ?? []),
          ].join(" "),
        );

        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [query, category]);

  const alphabet = React.useMemo(
    () =>
      Array.from(
        new Set(
          GLOSSARY_TERMS.map((item) =>
            item.term.charAt(0).toUpperCase(),
          ),
        ),
      ).sort(),
    [],
  );

  const scrollToLetter = (letter: string) => {
    const first = filteredTerms.find(
      (item) => item.term.charAt(0).toUpperCase() === letter,
    );

    if (!first) return;

    document
      .getElementById(`glossary-${first.id}`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  };

  const categoryEntries = Object.entries(
    CATEGORY_CONFIG,
  ) as Array<
    [
      GlossaryCategory,
      (typeof CATEGORY_CONFIG)[GlossaryCategory],
    ]
  >;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="glossary" navigate={navigate} />

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 32,
            padding: 34,
            background:
              "radial-gradient(circle at 12% 12%, rgba(255,115,60,0.16), transparent 34%), radial-gradient(circle at 88% 15%, rgba(124,58,237,0.15), transparent 34%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(6,11,20,0.99))",
            border: "1px solid rgba(255,115,60,0.24)",
            boxShadow:
              "0 28px 90px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.035)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 300,
              height: 300,
              borderRadius: "50%",
              right: -120,
              bottom: -170,
              background: "rgba(124,58,237,0.14)",
              filter: "blur(30px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1.3fr 0.7fr",
              gap: 28,
              alignItems: "end",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  color: "#ff9a70",
                  background: "rgba(255,115,60,0.09)",
                  border: "1px solid rgba(255,115,60,0.22)",
                  fontSize: 10,
                  fontWeight: 950,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#ff7346",
                    boxShadow: "0 0 12px rgba(255,115,70,0.8)",
                  }}
                />
                {language === "it"
                  ? "MARGINLAB KNOWLEDGE BASE"
                  : "MARGINLAB KNOWLEDGE BASE"}
              </div>

              <h1
                style={{
                  margin: "19px 0 0",
                  maxWidth: 850,
                  color: "#f8fafc",
                  fontSize: 46,
                  lineHeight: 1.05,
                  fontWeight: 950,
                  letterSpacing: "-0.055em",
                }}
              >
                {language === "it"
                  ? "Il linguaggio della redditività, finalmente chiaro."
                  : "The language of profitability, made clear."}
              </h1>

              <p
                style={{
                  margin: "16px 0 0",
                  maxWidth: 820,
                  color: "rgba(255,255,255,0.64)",
                  fontSize: 15,
                  lineHeight: 1.7,
                  fontWeight: 700,
                }}
              >
                {language === "it"
                  ? "Definizioni pratiche dei concetti utilizzati da MarginLab. Non un dizionario finanziario generico: ogni termine è spiegato nel modo in cui viene utilizzato nelle analisi, nei simulatori e nelle decisioni dello store."
                  : "Practical definitions of the concepts used by MarginLab. Not a generic finance dictionary: every term is explained in the context of MarginLab analyses, simulations and store decisions."}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 11,
              }}
            >
              {[
                {
                  value: GLOSSARY_TERMS.length,
                  label:
                    language === "it"
                      ? "Termini"
                      : "Terms",
                },
                {
                  value: categoryEntries.length,
                  label:
                    language === "it"
                      ? "Aree"
                      : "Areas",
                },
                {
                  value: "IT / EN",
                  label:
                    language === "it"
                      ? "Lingue"
                      : "Languages",
                },
                {
                  value: "100%",
                  label:
                    language === "it"
                      ? "MarginLab"
                      : "MarginLab",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: 17,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.035)",
                    border:
                      "1px solid rgba(255,255,255,0.075)",
                  }}
                >
                  <div
                    style={{
                      color: "#f8fafc",
                      fontSize: 23,
                      fontWeight: 950,
                    }}
                  >
                    {item.value}
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 22,
            padding: 22,
            borderRadius: 25,
            background:
              "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
            border: "1px solid rgba(255,115,60,0.18)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr auto",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.34)",
                  fontSize: 18,
                }}
              >
                ⌕
              </span>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder={
                  language === "it"
                    ? "Cerca un termine, una metrica o un concetto..."
                    : "Search for a term, metric or concept..."
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 52,
                  padding: "0 18px 0 46px",
                  borderRadius: 16,
                  outline: "none",
                  color: "#f8fafc",
                  background: "rgba(255,255,255,0.035)",
                  border:
                    "1px solid rgba(255,115,60,0.20)",
                  fontSize: 14,
                  fontWeight: 800,
                }}
              />
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.46)",
                fontSize: 11,
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {filteredTerms.length}{" "}
              {language === "it"
                ? "risultati"
                : "results"}
            </div>
          </div>

          <div
            style={{
              marginTop: 15,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setCategory("all")}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                cursor: "pointer",
                color:
                  category === "all"
                    ? "#fff"
                    : "rgba(255,255,255,0.55)",
                background:
                  category === "all"
                    ? "rgba(255,115,60,0.16)"
                    : "rgba(255,255,255,0.03)",
                border:
                  category === "all"
                    ? "1px solid rgba(255,115,60,0.38)"
                    : "1px solid rgba(255,255,255,0.07)",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {language === "it" ? "Tutti" : "All"}
            </button>

            {categoryEntries.map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                style={{
                  padding: "9px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  color:
                    category === key
                      ? config.color
                      : "rgba(255,255,255,0.52)",
                  background:
                    category === key
                      ? config.background
                      : "rgba(255,255,255,0.03)",
                  border:
                    category === key
                      ? `1px solid ${config.border}`
                      : "1px solid rgba(255,255,255,0.07)",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                {language === "it"
                  ? config.it
                  : config.en}
              </button>
            ))}
          </div>
        </section>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          {alphabet.map((letter) => {
            const available = filteredTerms.some(
              (item) =>
                item.term.charAt(0).toUpperCase() === letter,
            );

            return (
              <button
                key={letter}
                type="button"
                disabled={!available}
                onClick={() => scrollToLetter(letter)}
                style={{
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 10,
                  cursor: available
                    ? "pointer"
                    : "default",
                  color: available
                    ? "#f8fafc"
                    : "rgba(255,255,255,0.18)",
                  background: available
                    ? "rgba(255,255,255,0.035)"
                    : "rgba(255,255,255,0.015)",
                  border:
                    "1px solid rgba(255,255,255,0.065)",
                  fontSize: 11,
                  fontWeight: 950,
                }}
              >
                {letter}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(360px,1fr))",
            gap: 14,
          }}
        >
          {filteredTerms.map((item) => {
            const config =
              CATEGORY_CONFIG[item.category];
            const expanded = expandedId === item.id;

            return (
              <article
                id={`glossary-${item.id}`}
                key={item.id}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  padding: 20,
                  borderRadius: 21,
                  background: expanded
                    ? `radial-gradient(circle at top right, ${config.background}, transparent 45%), linear-gradient(180deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))`
                    : "linear-gradient(180deg, rgba(16,23,37,0.97), rgba(7,12,21,0.99))",
                  border: expanded
                    ? `1px solid ${config.border}`
                    : "1px solid rgba(255,255,255,0.07)",
                  transition:
                    "border-color 180ms ease, transform 180ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        padding: "6px 8px",
                        borderRadius: 999,
                        color: config.color,
                        background: config.background,
                        border: `1px solid ${config.border}`,
                        fontSize: 8,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it"
                        ? config.it
                        : config.en}
                    </div>

                    <h2
                      style={{
                        margin: "11px 0 0",
                        color: "#f8fafc",
                        fontSize: 19,
                        lineHeight: 1.25,
                        fontWeight: 950,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {item.term}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(
                        expanded ? null : item.id,
                      )
                    }
                    aria-label={
                      expanded
                        ? "Collapse"
                        : "Expand"
                    }
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: 11,
                      cursor: "pointer",
                      color: expanded
                        ? config.color
                        : "rgba(255,255,255,0.52)",
                      background: expanded
                        ? config.background
                        : "rgba(255,255,255,0.035)",
                      border: expanded
                        ? `1px solid ${config.border}`
                        : "1px solid rgba(255,255,255,0.07)",
                      fontSize: 17,
                      fontWeight: 900,
                    }}
                  >
                    {expanded ? "−" : "+"}
                  </button>
                </div>

                <p
                  style={{
                    margin: "13px 0 0",
                    color: "rgba(255,255,255,0.70)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontWeight: 760,
                  }}
                >
                  {item.short[language]}
                </p>

                {expanded && (
                  <div
                    style={{
                      marginTop: 15,
                      paddingTop: 15,
                      borderTop:
                        "1px solid rgba(255,255,255,0.065)",
                    }}
                  >
                    <div
                      style={{
                        color: config.color,
                        fontSize: 9,
                        fontWeight: 950,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it"
                        ? "COME LO USA MARGINLAB"
                        : "HOW MARGINLAB USES IT"}
                    </div>

                    <p
                      style={{
                        margin: "8px 0 0",
                        color:
                          "rgba(255,255,255,0.58)",
                        fontSize: 12,
                        lineHeight: 1.65,
                        fontWeight: 720,
                      }}
                    >
                      {item.detail[language]}
                    </p>

                    {item.related &&
                      item.related.length > 0 && (
                        <div
                          style={{
                            marginTop: 13,
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {item.related.map((related) => (
                            <span
                              key={related}
                              style={{
                                padding: "6px 8px",
                                borderRadius: 999,
                                color:
                                  "rgba(255,255,255,0.48)",
                                background:
                                  "rgba(255,255,255,0.025)",
                                border:
                                  "1px solid rgba(255,255,255,0.06)",
                                fontSize: 9,
                                fontWeight: 800,
                              }}
                            >
                              {related}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {filteredTerms.length === 0 && (
          <div
            style={{
              marginTop: 20,
              padding: 38,
              borderRadius: 22,
              textAlign: "center",
              background: "rgba(255,255,255,0.025)",
              border:
                "1px dashed rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                color: "#f8fafc",
                fontSize: 18,
                fontWeight: 950,
              }}
            >
              {language === "it"
                ? "Nessun termine trovato"
                : "No terms found"}
            </div>

            <div
              style={{
                marginTop: 7,
                color: "rgba(255,255,255,0.45)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {language === "it"
                ? "Prova una ricerca diversa o rimuovi il filtro di categoria."
                : "Try another search or clear the category filter."}
            </div>
          </div>
        )}

        <section
          style={{
            marginTop: 24,
            marginBottom: 24,
            padding: 22,
            borderRadius: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            background:
              "radial-gradient(circle at top left, rgba(255,115,60,0.10), transparent 38%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))",
            border: "1px solid rgba(255,115,60,0.18)",
          }}
        >
          <div>
            <div
              style={{
                color: "#ff9a70",
                fontSize: 9,
                fontWeight: 950,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
              }}
            >
              {language === "it"
                ? "MARGINLAB REFERENCE"
                : "MARGINLAB REFERENCE"}
            </div>

            <div
              style={{
                marginTop: 7,
                color: "#f8fafc",
                fontSize: 18,
                fontWeight: 950,
              }}
            >
              {language === "it"
                ? "Dalla definizione alla decisione."
                : "From definition to decision."}
            </div>

            <div
              style={{
                marginTop: 5,
                color: "rgba(255,255,255,0.50)",
                fontSize: 11,
                lineHeight: 1.55,
                fontWeight: 720,
              }}
            >
              {language === "it"
                ? "Il Glossary spiega i concetti. Le pagine operative MarginLab li trasformano in analisi e azioni concrete."
                : "The Glossary explains the concepts. MarginLab operational modules turn them into analysis and concrete actions."}
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/app")}
          >
            {language === "it"
              ? "Torna alla dashboard →"
              : "Back to dashboard →"}
          </button>
        </section>
      </div>
    </div>
  );
}