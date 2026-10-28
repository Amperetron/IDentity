#!/usr/bin/env python3
"""Generate reproducible synthetic AICTE admissions demo data and validate it."""
import csv, json, os, random
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import numpy as np

random.seed(2026); rng = np.random.default_rng(2026)
OUT = "generated"; os.makedirs(os.path.join(OUT, "batches"), exist_ok=True)
SEEDED = {str(987654320000 + i) for i in range(1, 41)}
OLD_REG = {str(987654320000 + i) for i in range(41, 61)}
EX = {"MH-COEP-01": (10, 2, 10, 2), "TN-TCEM-02": (8, 1, 8, 1)}  # intake, quota, admitted, nri

# state, 4-letter code, city, intake, target admitted, NRI group (F=full, Z=zero, P=partial)
SPECS = [
    ("Gujarat", "SVIT", "Ahmedabad", 12, 12, "P"), ("Gujarat", "NRIT", "Surat", 12, 12, "P"),
    ("Gujarat", "SBIT", "Vadodara", 12, 11, "P"), ("Rajasthan", "MRWR", "Jaipur", 15, 15, "P"),
    ("Rajasthan", "MEWR", "Jodhpur", 15, 15, "P"), ("Rajasthan", "ARVL", "Udaipur", 15, 2, "Z"),
    ("West Bengal", "HGHL", "Kolkata", 30, 20, "F"), ("West Bengal", "DGPR", "Durgapur", 24, 10, "P"),
    ("Kerala", "MLBR", "Kochi", 36, 22, "F"), ("Kerala", "PRYR", "Thiruvananthapuram", 30, 13, "P"),
    ("Andhra Pradesh", "GDVR", "Vijayawada", 20, 19, "F"), ("Andhra Pradesh", "KRSN", "Visakhapatnam", 18, 7, "P"),
    ("Madhya Pradesh", "VNDH", "Indore", 24, 15, "F"), ("Madhya Pradesh", "BNDL", "Bhopal", 24, 14, "P"),
    ("Odisha", "KLNG", "Bhubaneswar", 40, 26, "P"), ("Odisha", "CHLK", "Cuttack", 24, 4, "Z"),
    ("Punjab", "STLJ", "Ludhiana", 18, 13, "P"), ("Punjab", "BEAS", "Amritsar", 15, 6, "P"),
    ("Haryana", "YMNA", "Gurugram", 20, 15, "P"), ("Haryana", "HRYN", "Panipat", 20, 8, "P"),
    ("Bihar", "MGDH", "Patna", 12, 4, "Z"), ("Bihar", "VKRM", "Gaya", 12, 0, "Z"),
    ("Karnataka", "MYSR", "Mysuru", 15, 14, "F"), ("Karnataka", "BLGV", "Belagavi", 20, 15, "P"),
    ("Karnataka", "HBLI", "Hubballi", 20, 8, "Z"), ("Maharashtra", "DCCN", "Nashik", 18, 17, "P"),
    ("Maharashtra", "SHYD", "Aurangabad", 24, 16, "P"), ("Maharashtra", "KNKM", "Nagpur", 18, 3, "Z"),
]
SC = {"Gujarat": "GJ", "Rajasthan": "RJ", "West Bengal": "WB", "Kerala": "KL",
      "Andhra Pradesh": "AP", "Madhya Pradesh": "MP", "Odisha": "OD", "Punjab": "PB",
      "Haryana": "HR", "Bihar": "BR", "Karnataka": "KA", "Maharashtra": "MH"}

while True:  # quota formula, retry until every partial college has room for at least one NRI
    colleges = []
    for st, code, city, intake, target, group in SPECS:
        q = max(1, int(round(intake * float(rng.uniform(0.08, 0.20)))))
        colleges.append({"id": f"{SC[st]}-{code}-01", "name": f"{city} {code} Institute of Technology",
                         "state": st, "intake": intake, "nriQuota": q, "target": target,
                         "group": group, "admitted": 0, "nriAdmitted": 0})
    cmap = {c["id"]: c for c in colleges}
    nri_total = sum(c["nriQuota"] for c in colleges if c["group"] == "F") + sum(1 for c in colleges if c["group"] == "P")
    if all(cmap[c["id"]]["nriQuota"] >= 2 for c in colleges if c["group"] == "P") and nri_total <= 0.12 * 336:
        break

# region-appropriate fictional names
NAMES = {
    "Gujarat": (["Aarav", "Ananya", "Dhruv", "Isha", "Jay", "Krisha", "Meet", "Nisha"], ["Patel", "Shah", "Mehta", "Desai", "Joshi"]),
    "Rajasthan": (["Akshay", "Divya", "Gaurav", "Komal", "Manish", "Priyanka"], ["Sharma", "Choudhary", "Meena", "Jat", "Rathore"]),
    "West Bengal": (["Anirban", "Debolina", "Prosenjit", "Ritika", "Sourav", "Tiyasha"], ["Banerjee", "Chatterjee", "Das", "Mukherjee", "Roy"]),
    "Kerala": (["Akhil", "Anu", "Jithin", "Meera", "Rahul", "Reshma"], ["Nair", "Menon", "Pillai", "Varghese", "Kurup"]),
    "Andhra Pradesh": (["Charan", "Harika", "Prasad", "Ramya", "Sai", "Teja"], ["Reddy", "Naidu", "Kumar", "Chowdary", "Rao"]),
    "Madhya Pradesh": (["Aditya", "Ankita", "Deepak", "Nikita", "Pawan", "Swati"], ["Verma", "Tripathi", "Patel", "Singh", "Jain"]),
    "Odisha": (["Biswajit", "Chinmayee", "Debasis", "Namrata", "Prasant", "Sasmita"], ["Mishra", "Das", "Mohanty", "Panda", "Patra"]),
    "Punjab": (["Arjun", "Gurleen", "Harpreet", "Jasmine", "Manpreet", "Navjot"], ["Singh", "Kaur", "Gill", "Dhillon", "Bajwa"]),
    "Haryana": (["Amit", "Deepika", "Manoj", "Neha", "Rahul", "Sakshi"], ["Yadav", "Singh", "Chaudhary", "Kumar", "Rathi"]),
    "Bihar": (["Abhishek", "Anjali", "Kumar", "Neha", "Rohit", "Shweta"], ["Singh", "Kumar", "Yadav", "Prasad", "Mishra"]),
    "Karnataka": (["Abhishek", "Ankita", "Karthik", "Nandini", "Prajwal", "Shreya"], ["Rao", "Hegde", "Shetty", "Nayak", "Kulkarni"]),
    "Maharashtra": (["Aditya", "Anjali", "Omkar", "Prachi", "Rohit", "Sneha"], ["Shinde", "Patil", "Kulkarni", "Deshmukh", "Jadhav"]),
    "Tamil Nadu": (["Aravind", "Deepa", "Karthik", "Meena", "Suresh", "Vidya"], ["Iyer", "Subramanian", "Raman", "Krishnan", "Natarajan"]),
}
def name_for(state):
    return f"{random.choice(NAMES[state][0])} {random.choice(NAMES[state][1])}"

REG = []
for i in range(480):
    dob = datetime(2006, 1, 1) + timedelta(days=random.randint(0, 1095))
    REG.append({"apaarId": str(987654330001 + i), "dob": dob.strftime("%Y-%m-%d")})
NAMES_BY_ID = {}
def new_student(state):
    aid = REG[len(NAMES_BY_ID)]["apaarId"]
    NAMES_BY_ID[aid] = name_for(state)
    return aid

PLAN = {
    "batch_1.csv": [("KA-MYSR-01", 8), ("KA-BLGV-01", 6), ("KA-HBLI-01", 5), ("MH-DCCN-01", 7),
                    ("MH-SHYD-01", 6), ("MH-KNKM-01", 2), ("KL-PRYR-01", 8), ("WB-DGPR-01", 6),
                    ("PB-STLJ-01", 7), ("PB-BEAS-01", 5)],
    "batch_2.csv": [("AP-GDVR-01", 19), ("AP-KRSN-01", 7), ("MP-BNDL-01", 14), ("OD-KLNG-01", 24), ("BR-MGDH-01", 2)],
    "batch_3.csv": [("GJ-SVIT-01", 12), ("GJ-NRIT-01", 12), ("GJ-SBIT-01", 11),
                    ("RJ-MRWR-01", 15), ("RJ-MEWR-01", 15), ("RJ-ARVL-01", 2)],
    "batch_4.csv": [("KL-MLBR-01", 22), ("WB-HGHL-01", 20), ("MP-VNDH-01", 13)],
    "batch_5.csv": [("HR-YMNA-01", 10), ("HR-HRYN-01", 8), ("MH-DCCN-01", 10)],
    "batch_6.csv": [("KA-MYSR-01", 6), ("KA-BLGV-01", 9), ("KA-HBLI-01", 3), ("MH-SHYD-01", 10),
                    ("MH-KNKM-01", 1), ("KL-PRYR-01", 5), ("WB-DGPR-01", 4), ("PB-STLJ-01", 6),
                    ("PB-BEAS-01", 1), ("MP-VNDH-01", 2), ("OD-KLNG-01", 2), ("OD-CHLK-01", 4),
                    ("BR-MGDH-01", 2), ("HR-YMNA-01", 5)],
}
slots = []
for bname, alloc in PLAN.items():
    for cid, n in alloc:
        slots += [{"batch": bname, "college": cid} for _ in range(n)]
by_college = defaultdict(list)
for i, s in enumerate(slots):
    by_college[s["college"]].append(i)
for c in colleges:
    nri = c["nriQuota"] if c["group"] == "F" else (1 if c["group"] == "P" else 0)
    for i in by_college[c["id"]][:nri]:
        slots[i]["nri"] = True

seq, err = defaultdict(int), defaultdict(int)
def admit_roll(cid):
    seq[cid] += 1
    return f"{cid.split('-')[1]}-2026-{random.choice(['CS', 'EC', 'ME', 'EE', 'IT', 'CE'])}{seq[cid]:02d}"
def reject_roll(cid, kind="ERR"):
    err[(cid, kind)] += 1
    return f"{(cid.split('-')[1] if cid else 'GEN')}-{kind}-{err[(cid, kind)]:02d}"

rows = {b: [] for b in PLAN}
aid_college = {}
for s in slots:
    c = cmap[s["college"]]; aid = new_student(c["state"]); aid_college[aid] = c["id"]
    rows[s["batch"]].append({"apaarId": aid, "name": NAMES_BY_ID[aid], "collegeId": c["id"],
                             "isNRI": "true" if s.get("nri") else "false",
                             "rollNo": admit_roll(c["id"]), "intended": "admitted"})
# batch 2: two unknown IDs, one empty collegeId, one 11-digit ID
for aid, nm, cid, why in [("987654339001", "Rohan Mehta", "AP-GDVR-01", "unknown_apaar"),
                          ("987654339002", "Kavya Shah", "OD-KLNG-01", "unknown_apaar"),
                          (new_student("Bihar"), None, "", "format_error"),
                          ("98765433012", "Amit Yadav", "MP-BNDL-01", "format_error")]:
    nm = nm or NAMES_BY_ID[aid]
    rows["batch_2.csv"].append({"apaarId": aid, "name": nm, "collegeId": cid, "isNRI": "false",
                                "rollNo": reject_roll(cid), "intended": why})
# batch 3: three rows against colleges filled earlier in the same file
for cid in ["GJ-SVIT-01", "RJ-MRWR-01", "GJ-NRIT-01"]:
    aid = new_student(cmap[cid]["state"])
    rows["batch_3.csv"].append({"apaarId": aid, "name": NAMES_BY_ID[aid], "collegeId": cid,
                                "isNRI": "false", "rollNo": reject_roll(cid), "intended": "college_full"})
# batch 4: five NRI rows after the three NRI-heavy colleges are full
for cid in ["KL-MLBR-01", "WB-HGHL-01", "MP-VNDH-01", "KL-MLBR-01", "WB-HGHL-01"]:
    aid = new_student(cmap[cid]["state"])
    rows["batch_4.csv"].append({"apaarId": aid, "name": NAMES_BY_ID[aid], "collegeId": cid,
                                "isNRI": "true", "rollNo": reject_roll(cid), "intended": "nri_quota_exceeded"})
# batch 5: six seeded IDs and six earlier IDs reapply at a different college
earlier = []
for b in ["batch_1.csv", "batch_2.csv", "batch_4.csv"]:
    earlier += [r["apaarId"] for r in rows[b] if r["intended"] == "admitted"][:2]
for aid in sorted(SEEDED)[:6] + earlier:
    original = aid_college.get(aid, "MH-COEP-01")
    target = next(c["id"] for c in colleges if c["id"] != original)
    rows["batch_5.csv"].append({"apaarId": aid, "name": NAMES_BY_ID.get(aid, name_for(cmap[target]["state"])),
                                "collegeId": target, "isNRI": "false",
                                "rollNo": reject_roll(target, "BATCH"), "intended": "seat_hoarding"})
# batch 6: two duplicate rows, then three rows at already-full existing colleges
for src in rows["batch_6.csv"][:2]:
    target = next(c["id"] for c in colleges if c["id"] != src["collegeId"])
    rows["batch_6.csv"].append({"apaarId": src["apaarId"], "name": src["name"], "collegeId": target,
                                "isNRI": "false", "rollNo": reject_roll(target, "BATCH"),
                                "intended": "seat_hoarding"})
for cid in ["MH-COEP-01", "TN-TCEM-02", "MH-COEP-01"]:
    aid = new_student("Maharashtra" if cid.startswith("MH") else "Tamil Nadu")
    rows["batch_6.csv"].append({"apaarId": aid, "name": NAMES_BY_ID[aid], "collegeId": cid,
                                "isNRI": "false", "rollNo": reject_roll(cid), "intended": "college_full"})

# rule-engine simulation
admitted = set(SEEDED)
counts = {cid: v[2] for cid, v in EX.items()}
nri_counts = {cid: v[3] for cid, v in EX.items()}
for c in colleges:
    counts[c["id"]] = nri_counts[c["id"]] = 0
expected = []
for bname, br in rows.items():
    for i, r in enumerate(br, 1):
        aid, nm, cid = str(r["apaarId"]).strip(), str(r["name"]).strip(), str(r["collegeId"]).strip()
        nri, roll = str(r["isNRI"]).strip().lower(), str(r["rollNo"]).strip()
        if not all([aid, nm, cid, nri, roll]) or len(aid) != 12 or not aid.isdigit():
            outcome = "format_error"
        elif aid not in {x["apaarId"] for x in REG} | SEEDED | OLD_REG:
            outcome = "unknown_apaar"
        elif aid in admitted:
            outcome = "seat_hoarding"
        elif cid in cmap and counts[cid] >= cmap[cid]["intake"] or cid in EX and counts[cid] >= EX[cid][0]:
            outcome = "college_full"
        elif nri == "true" and (nri_counts.get(cid, 0) >= (cmap[cid]["nriQuota"] if cid in cmap else EX.get(cid, (0, 0))[1])):
            outcome = "nri_quota_exceeded"
        else:
            outcome = "admitted"
        assert outcome == r["intended"], (bname, i, outcome, r["intended"], r)
        expected.append({"batch": bname, "row": i, "apaarId": aid, "collegeId": cid, "expected_outcome": outcome})
        if outcome == "admitted":
            assert aid not in admitted
            admitted.add(aid); counts[cid] += 1
            if nri == "true": nri_counts[cid] += 1

# outputs
for bname, br in rows.items():
    with open(os.path.join(OUT, "batches", bname), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["apaarId", "name", "collegeId", "isNRI", "rollNo"])
        w.writerows([[r["apaarId"], r["name"], r["collegeId"], r["isNRI"], r["rollNo"]] for r in br])
with open(os.path.join(OUT, "EXPECTED.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["batch", "row", "apaarId", "collegeId", "expected_outcome"])
    w.writeheader(); w.writerows(expected)
state_rows = []
for c in colleges:
    c["admitted"], c["nriAdmitted"] = counts[c["id"]], nri_counts[c["id"]]
    state_rows.append({"collegeId": c["id"], "name": c["name"], "state": c["state"], "intake": c["intake"],
                       "admitted": c["admitted"], "nriQuota": c["nriQuota"], "nriAdmitted": c["nriAdmitted"],
                       "utilization_pct": round(100 * c["admitted"] / c["intake"], 1)})
with open(os.path.join(OUT, "EXPECTED_STATE.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["collegeId", "name", "state", "intake", "admitted", "nriQuota",
                                      "nriAdmitted", "utilization_pct"])
    w.writeheader(); w.writerows(state_rows)
with open(os.path.join(OUT, "data_extra.js"), "w", encoding="utf-8") as f:
    f.write("(function(){ var S = window.SEED;\n")
    for c in colleges:
        f.write(f'  S.colleges.push({{id:{json.dumps(c["id"])}, name:{json.dumps(c["name"])}, '
                f'state:{json.dumps(c["state"])}, intake:{c["intake"]}, nriQuota:{c["nriQuota"]}}});\n')
    for r in REG:
        nm = NAMES_BY_ID.get(r["apaarId"], name_for(random.choice(list(NAMES))))
        f.write(f'  S.apaar.push({{apaarId:{json.dumps(r["apaarId"])}, name:{json.dumps(nm)}, '
                f'dob:{json.dumps(r["dob"])}}});\n')
    f.write("})();\n")

VERIFY = '''#!/usr/bin/env python3
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
    out("13. Colleges whose name contains \\"Institute\\"", [(r["College ID"], r["Institution"]) for r in rows if "institute" in r["Institution"].lower()])
    out("14. Colleges with more than 5 vacant seats", [(r["College ID"], I(r["Total Intake"]) - I(r["Admitted"])) for r in rows if I(r["Total Intake"]) - I(r["Admitted"]) > 5])
    print("15. Total admitted students across all colleges")
    print(sum(I(r["Admitted"]) for r in rows))
main()
'''
with open(os.path.join(OUT, "verify_queries.py"), "w", encoding="utf-8") as f:
    f.write(VERIFY)

# validation
for bname, br in rows.items():
    assert len(br) <= 70
    with open(os.path.join(OUT, "batches", bname), newline="", encoding="utf-8") as f:
        assert next(csv.reader(f)) == ["apaarId", "name", "collegeId", "isNRI", "rollNo"]
assert len({r["apaarId"] for r in REG}) == 480 and not ({r["apaarId"] for r in REG} & (SEEDED | OLD_REG))
assert all(c["admitted"] <= c["intake"] and c["nriAdmitted"] <= c["nriQuota"] for c in colleges)
assert len(admitted) == 40 + sum(c["admitted"] for c in colleges) == 376
def bucket(c):
    u = 100 * c["admitted"] / c["intake"]
    return "100" if u == 100 else "90-99" if u >= 90 else "60-89" if u >= 60 else "25-59" if u >= 25 else "<25"
bc = Counter(bucket(c) for c in colleges)
assert bc == {"100": 4, "90-99": 4, "60-89": 8, "25-59": 8, "<25": 4}, bc
assert sum(c["nriAdmitted"] == c["nriQuota"] for c in colleges) == 5
assert sum(c["nriAdmitted"] == 0 for c in colleges) == 6
avg = {s: sum(c["admitted"] for c in colleges if c["state"] == s) / sum(c["intake"] for c in colleges if c["state"] == s) for s in SC}
assert max(avg, key=avg.get) == "Gujarat" and min(avg, key=avg.get) == "Bihar"

print("Rows / outcomes per batch:")
for bname, br in rows.items():
    reasons = Counter(r["expected_outcome"] for r in expected if r["batch"] == bname)
    print(f"  {bname}: rows={len(br)} admitted={reasons['admitted']} rejected={len(br)-reasons['admitted']} "
          f"{dict((k, v) for k, v in reasons.items() if k != 'admitted')}")
print("Utilization buckets:", dict(bc))
print("NRI: full=%d zero=%d partial=%d" % (sum(c["nriAdmitted"] == c["nriQuota"] for c in colleges),
      sum(c["nriAdmitted"] == 0 for c in colleges), sum(0 < c["nriAdmitted"] < c["nriQuota"] for c in colleges)))
print("State average utilization:", {k: round(v * 100, 1) for k, v in sorted(avg.items(), key=lambda kv: -kv[1])})
print(f"New registry entries: {len(REG)}; admitted new students: {sum(c['admitted'] for c in colleges)}")
print("Generated:", OUT)
