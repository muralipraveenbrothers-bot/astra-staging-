**Pipeline summary for PersW040 — 25/32 rules complete.**

Next up is **Rule 24** (`24-persw040-cupid-axes-for-profit-loss-and-pnl.tfl`): the P&L/Cupid axes migration. I have a concrete 5-step plan from grading:
- score PHYSICAL_TALLY → 0 tie-breakers
- extract axis metadata into a Python dict
- copy `rule_23_axes_set` as the P&L CUBE, then remove the CUBE dedup call (P&L is itself a CUBE)
- leave the `DATA_LOSS` shape/partition tests alone (correct as-is)
- bump the count once Rule 24's assertions pass

For Rule 25, the bash autograder is just pointing at the wrong metric name in `it_takes_snapshot()` — should be `persisted_counts` not `persisted_cols`. That's a one-line fix.

I'm at a stopping point: I need Confirmation to proceed, because grading is still running and I don't know which of the remaining rules (24/25) will actually need work, or whether there's anything else blocking the final `25/32` / promotion. I have the plan for both, but I won't start building until you confirm.

Shall I go ahead with Rule 24 (the P&L/Cupid axes migration) next, along with the Rule 25 metric-name fix, and stop when grading + promotion are clear?