#!/usr/bin/env python3
import csv, sys
from collections import Counter, defaultdict
def main():
    if len(sys.argv) != 2:
        print("usage: python verify_queries.py dashboard_export.csv")
        return
    rows = list(csv.DictReader(open(sys.argv[1], newline="", encoding="utf-8")))
    I = lambda x: int(str(x).strip())
    P = lambda x: float(str(x).strip().replace("%", ""))
    N = lambda r: tuple(map(int, str(r["NRI Admitted"]).replace(" ", "").split("/")))
    def out(q, items):
        print(q)
        for x in items: print("  " + " | ".join(map(str, x)))
        print()
    out("1. Colleges in Karnataka above 80% utilization", [(r["College ID"], r["Institution"], r["Utilization"]) for r in rows if r["State"] == "Karnataka" and P(r["Utilization"]) > 80])
    out("2. Colleges below 40% utilization", [(r["College ID"], r["Institution"], r["Utilization"]) for r in rows if P(r["Utilization"]) < 40])
    out("3. Colleges with all NRI seats used", [(r["College ID"], r["Institution"], r["NRI Admitted"]) for r in rows if N(r)[1] > 0 and N(r)[0] == N(r)[1]])
    out("4. Colleges with no NRI admissions", [(r["College ID"], r["Institution"], r["NRI Admitted"]) for r in rows if N(r)[0] == 0])
    out("5. Top 5 colleges by admitted students", [(r["College ID"], r["Institution"], I(r["Admitted"])) for r in sorted(rows, key=lambda x: (-I(x["Admitted"]), x["College ID"]))[:5]])
    least = sorted(rows, key=lambda x: (P(x["Utilization"]), x["College ID"]))[0]
    out("6. Least utilized college", [(least["College ID"], least["Institution"], least["Utilization"])])
    out("7. Colleges in Gujarat", [(r["College ID"], r["Institution"]) for r in rows if r["State"] == "Gujarat"])
    out("8. Colleges at 100% capacity", [(r["College ID"], r["Institution"]) for r in rows if abs(P(r["Utilization"]) - 100) < 1e-9])
    out("9. Colleges with intake above 30", [(r["College ID"], r["Total Intake"]) for r in rows if I(r["Total Intake"]) > 30])
    out("10. Colleges in Maharashtra with unused NRI seats", [(r["College ID"], r["NRI Admitted"]) for r in rows if r["State"] == "Maharashtra" and N(r)[0] < N(r)[1]])
    by_state = defaultdict(list)
    for r in rows: by_state[r["State"]].append(P(r["Utilization"]))
    out("11. Average utilization per state, highest first", [(s, round(sum(v) / len(v), 1)) for s, v in sorted(by_state.items(), key=lambda kv: (-sum(kv[1]) / len(kv[1]), kv[0]))])
    out("12. Number of colleges per state", sorted(Counter(r["State"] for r in rows).items()))
    out("13. Colleges whose name contains \"Institute\"", [(r["College ID"], r["Institution"]) for r in rows if "institute" in r["Institution"].lower()])
    out("14. Colleges with more than 5 vacant seats", [(r["College ID"], I(r["Total Intake"]) - I(r["Admitted"])) for r in rows if I(r["Total Intake"]) - I(r["Admitted"]) > 5])
    print("15. Total admitted students across all colleges")
    print(sum(I(r["Admitted"]) for r in rows))
main()
