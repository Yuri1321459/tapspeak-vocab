/* TapSpeak Vocab - filters.js
   Purpose:
   - Word list filtering by:
     (A) Category (multi-select)
     (B) Stage (multi-select)
   - Apply as: (CategoryGroup OR) AND (StageGroup OR)

   Spec rules (fixed):
   - Category filter includes:
     - "ぜんかてごり" (all categories) : exclusive
     - individual categories (multi-select)
   - Stage filter includes:
     - "ぜんすてーじ" (all stages) : exclusive
     - "みとうろく" (not enrolled)
     - "0".."6" (enrolled stages)
   - "ぜん～" is exclusive: cannot be selected with others in same group.
   - If user selects any individual option, "ぜん～" must turn off automatically.
   - Must never allow "none selected" in a group:
     - default: all-category selected; all-stage selected
*/

(function () {
  "use strict";

  const ALL_CATEGORY = "ALL_CATEGORY";
  const ALL_STAGE = "ALL_STAGE";
  const NOT_ENROLLED = "NOT_ENROLLED";

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function clampStageToken(token) {
    const s = String(token);
    if (/^[0-6]$/.test(s)) return s;
    return null;
  }

  // Build default filter state
  function createDefaultFilterState() {
    return {
      category: [ALL_CATEGORY], // exclusive default
      stage: [ALL_STAGE]        // exclusive default
    };
  }

  // Normalize any incoming state to match spec rules
  function normalizeFilterState(state, categories) {
    const cats = asArray(state?.category).map(String);
    const stgs = asArray(state?.stage).map(String);

    const validCategoryIds = new Set((categories || []).map(c => String(c.category_id)));

    let nextCategory = cats.filter(x => x === ALL_CATEGORY || validCategoryIds.has(x));
    nextCategory = unique(nextCategory);

    let nextStage = [];
    for (const x of stgs) {
      if (x === ALL_STAGE || x === NOT_ENROLLED) nextStage.push(x);
      const t = clampStageToken(x);
      if (t != null) nextStage.push(t);
    }
    nextStage = unique(nextStage);

    // Enforce exclusivity and "never none selected"
    nextCategory = enforceExclusiveAndNonEmpty(nextCategory, ALL_CATEGORY);
    nextStage = enforceExclusiveAndNonEmpty(nextStage, ALL_STAGE);

    // If ALL is present with others, keep ALL only
    if (nextCategory.includes(ALL_CATEGORY) && nextCategory.length > 1) nextCategory = [ALL_CATEGORY];
    if (nextStage.includes(ALL_STAGE) && nextStage.length > 1) nextStage = [ALL_STAGE];

    return {
      category: nextCategory,
      stage: nextStage
    };
  }

  function enforceExclusiveAndNonEmpty(list, allToken) {
    let out = unique(asArray(list).map(String));

    // If empty -> default to all
    if (out.length === 0) return [allToken];

    // If "all" is selected, it must be exclusive
    if (out.includes(allToken) && out.length > 1) return [allToken];

    return out;
  }

  // Toggle selection inside one group, respecting rules
  function toggleInGroup(currentList, token, allToken) {
    let list = unique(asArray(currentList).map(String));
    const t = String(token);

    // Clicking ALL => set to [ALL]
    if (t === allToken) return [allToken];

    const has = list.includes(t);

    // If ALL is selected and user clicks an individual => remove ALL, then add individual
    if (list.includes(allToken)) {
      list = list.filter(x => x !== allToken);
      list.push(t);
      return unique(list);
    }

    // Otherwise, normal toggle
    if (has) {
      list = list.filter(x => x !== t);
    } else {
      list.push(t);
    }

    // Never none selected
    if (list.length === 0) return [allToken];

    return unique(list);
  }

  // Public: update category selection
  function updateCategoryFilter(filterState, token, categories) {
    const st = normalizeFilterState(filterState, categories);
    const next = toggleInGroup(st.category, token, ALL_CATEGORY);

    // Ensure only valid categories remain (except ALL)
    const validCategoryIds = new Set((categories || []).map(c => String(c.category_id)));
    const cleaned = next.filter(x => x === ALL_CATEGORY || validCategoryIds.has(x));

    // Never none selected
    const finalList = enforceExclusiveAndNonEmpty(cleaned, ALL_CATEGORY);
    // Exclusivity
    const finalExclusive = (finalList.includes(ALL_CATEGORY) && finalList.length > 1) ? [ALL_CATEGORY] : finalList;

    return { ...st, category: finalExclusive };
  }

  // Public: update stage selection
  function updateStageFilter(filterState, token, categories) {
    const st = normalizeFilterState(filterState, categories);
    const t = String(token);

    // Validate stage token
    let safeToken = null;
    if (t === ALL_STAGE || t === NOT_ENROLLED) safeToken = t;
    else safeToken = clampStageToken(t);

    // If invalid token, keep state as-is
    if (safeToken == null) return st;

    const next = toggleInGroup(st.stage, safeToken, ALL_STAGE);

    // Normalize stage list values
    const cleaned = [];
    for (const x of next) {
      if (x === ALL_STAGE || x === NOT_ENROLLED) cleaned.push(x);
      const s = clampStageToken(x);
      if (s != null) cleaned.push(s);
    }

    const finalList = enforceExclusiveAndNonEmpty(unique(cleaned), ALL_STAGE);
    const finalExclusive = (finalList.includes(ALL_STAGE) && finalList.length > 1) ? [ALL_STAGE] : finalList;

    return { ...st, stage: finalExclusive };
  }

  // Utility: determine whether a word item matches filter
  // word: { id, category_id, ... }
  // progressGetter(wordId) => { enrolled:boolean, stage:number } or null
  function matchesFilter(word, filterState, progressGetter, categories) {
    const st = normalizeFilterState(filterState, categories);

    // ----- Category group (OR within group) -----
    const catOk = st.category.includes(ALL_CATEGORY)
      ? true
      : st.category.includes(String(word.category_id));

    if (!catOk) return false;

    // ----- Stage group (OR within group) -----
    if (st.stage.includes(ALL_STAGE)) return true;

    const prog = (typeof progressGetter === "function") ? progressGetter(word.id) : null;
    const enrolled = Boolean(prog && prog.enrolled);
    const stageNum = enrolled ? Number(prog.stage) : null;

    // not enrolled
    if (!enrolled) {
      return st.stage.includes(NOT_ENROLLED);
    }

    // enrolled stages
    const sTok = String(Math.max(0, Math.min(6, Math.trunc(stageNum))));
    return st.stage.includes(sTok);
  }

  // Public: build "UI options" (labels only; rendering is up to words.js)
  function buildCategoryOptions(categories) {
    const opts = [{ token: ALL_CATEGORY, label_kana: "ぜんかてごり", label_ja: "" }];
    for (const c of (categories || [])) {
      opts.push({
        token: String(c.category_id),
        label_kana: String(c.category_label_kana || ""),
        label_ja: String(c.category_label_ja || "")
      });
    }
    return opts;
  }

  function buildStageOptions() {
    return [
      { token: ALL_STAGE, label_kana: "ぜんすてーじ" },
      { token: NOT_ENROLLED, label_kana: "みとうろく" },
      { token: "0", label_kana: "0" },
      { token: "1", label_kana: "1" },
      { token: "2", label_kana: "2" },
      { token: "3", label_kana: "3" },
      { token: "4", label_kana: "4" },
      { token: "5", label_kana: "5" },
      { token: "6", label_kana: "6" }
    ];
  }

  // Expose
  window.TapSpeakFilters = {
    ALL_CATEGORY,
    ALL_STAGE,
    NOT_ENROLLED,

    createDefaultFilterState,
    normalizeFilterState,

    updateCategoryFilter,
    updateStageFilter,

    matchesFilter,

    buildCategoryOptions,
    buildStageOptions
  };
})();
