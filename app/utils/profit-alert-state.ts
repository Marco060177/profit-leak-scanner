export type ProfitAlertStatus =
  | "new"
  | "active"
  | "acknowledged"
  | "resolved";

export type StoredProfitAlertState = {
  alertId: string;
  status: ProfitAlertStatus;
  isRead: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
};

export type ProfitAlertStateMap = Record<
  string,
  StoredProfitAlertState
>;

const STORAGE_KEY = "marginlab_profit_alert_states";

function canUseBrowserStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function safelyParseStoredStates(
  value: string | null,
): ProfitAlertStateMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as ProfitAlertStateMap;
    }

    return {};
  } catch {
    return {};
  }
}

export function getStoredProfitAlertStates(): ProfitAlertStateMap {
  if (!canUseBrowserStorage()) {
    return {};
  }

  return safelyParseStoredStates(
    window.localStorage.getItem(STORAGE_KEY),
  );
}

export function saveProfitAlertStates(
  states: ProfitAlertStateMap,
) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(states),
  );
}

export function syncProfitAlertStates(
  activeAlertIds: string[],
): ProfitAlertStateMap {
  const currentStates = getStoredProfitAlertStates();
  const now = getCurrentTimestamp();

  const activeIds = new Set(activeAlertIds);
  const nextStates: ProfitAlertStateMap = {
    ...currentStates,
  };

  for (const alertId of activeAlertIds) {
    const existing = currentStates[alertId];

    if (!existing) {
      nextStates[alertId] = {
        alertId,
        status: "new",
        isRead: false,
        firstSeenAt: now,
        lastSeenAt: now,
      };

      continue;
    }

    nextStates[alertId] = {
      ...existing,
      status:
        existing.status === "resolved"
          ? "active"
          : existing.status,
      lastSeenAt: now,
      resolvedAt:
        existing.status === "resolved"
          ? undefined
          : existing.resolvedAt,
    };
  }

  for (const [alertId, state] of Object.entries(currentStates)) {
    if (
      !activeIds.has(alertId) &&
      state.status !== "resolved"
    ) {
      nextStates[alertId] = {
        ...state,
        status: "resolved",
        isRead: true,
        resolvedAt: now,
      };
    }
  }

  saveProfitAlertStates(nextStates);

  return nextStates;
}

export function markProfitAlertAsRead(
  alertId: string,
): ProfitAlertStateMap {
  const states = getStoredProfitAlertStates();
  const existing = states[alertId];

  if (!existing) {
    return states;
  }

  const nextStates: ProfitAlertStateMap = {
    ...states,
    [alertId]: {
      ...existing,
      isRead: true,
      status:
        existing.status === "new"
          ? "active"
          : existing.status,
    },
  };

  saveProfitAlertStates(nextStates);

  return nextStates;
}

export function acknowledgeProfitAlert(
  alertId: string,
): ProfitAlertStateMap {
  const states = getStoredProfitAlertStates();
  const existing = states[alertId];

  if (!existing) {
    return states;
  }

  const nextStates: ProfitAlertStateMap = {
    ...states,
    [alertId]: {
      ...existing,
      status: "acknowledged",
      isRead: true,
      acknowledgedAt: getCurrentTimestamp(),
    },
  };

  saveProfitAlertStates(nextStates);

  return nextStates;
}

export function restoreProfitAlert(
  alertId: string,
): ProfitAlertStateMap {
  const states = getStoredProfitAlertStates();
  const existing = states[alertId];

  if (!existing) {
    return states;
  }

  const nextStates: ProfitAlertStateMap = {
    ...states,
    [alertId]: {
      ...existing,
      status: "active",
      isRead: true,
      acknowledgedAt: undefined,
      resolvedAt: undefined,
    },
  };

  saveProfitAlertStates(nextStates);

  return nextStates;
}

export function markAllProfitAlertsAsRead(): ProfitAlertStateMap {
  const states = getStoredProfitAlertStates();

  const nextStates = Object.fromEntries(
    Object.entries(states).map(([alertId, state]) => [
      alertId,
      {
        ...state,
        isRead: true,
        status:
          state.status === "new"
            ? "active"
            : state.status,
      },
    ]),
  ) as ProfitAlertStateMap;

  saveProfitAlertStates(nextStates);

  return nextStates;
}

export function getUnreadProfitAlertCount(
  states: ProfitAlertStateMap,
) {
  return Object.values(states).filter(
    (state) =>
      !state.isRead &&
      state.status !== "resolved",
  ).length;
}

export function getProfitAlertStatusCounts(
  states: ProfitAlertStateMap,
) {
  return Object.values(states).reduce(
    (counts, state) => {
      counts.total += 1;
      counts[state.status] += 1;

      if (
        !state.isRead &&
        state.status !== "resolved"
      ) {
        counts.unread += 1;
      }

      return counts;
    },
    {
      total: 0,
      unread: 0,
      new: 0,
      active: 0,
      acknowledged: 0,
      resolved: 0,
    },
  );
}