// srs.js — stage schedule with stage0 (immediate)
(function(){
  // stage0: immediate due (now)
  // stage1..6: intervals (days)
  const STAGE_DAYS = {
    0: 0,
    1: 3,
    2: 7,
    3: 14,
    4: 30,
    5: 90,
    6: 365,
  };

  function daysToMs(d){ return d * 24 * 60 * 60 * 1000; }
  function nowMs(){ return Date.now(); }

  function dueNow(){ return nowMs(); }

  function calcNextDue(stage){
    const s = Math.max(0, Math.min(6, stage));
    const d = STAGE_DAYS[s] ?? 3;
    return nowMs() + daysToMs(d);
  }

  function advanceOnSaid(currentStage){
    // stage0 -> 1 -> 2 ... -> 6
    if(currentStage === null || currentStage === undefined) return 1;
    return Math.min(6, Number(currentStage) + 1);
  }

  function regressOnForgot(currentStage){
    // forgot => stage down by 1 (min 0)
    if(currentStage === null || currentStage === undefined) return 0;
    return Math.max(0, Number(currentStage) - 1);
  }

  function isDue(item){
    return item && item.enrolled && typeof item.due_at_ms === "number" && item.due_at_ms <= nowMs();
  }

  window.SRS = {
    STAGE_DAYS,
    dueNow,
    calcNextDue,
    advanceOnSaid,
    regressOnForgot,
    isDue
  };
})();
