import pandas as pd, json, os, re, datetime as dt, calendar
from collections import defaultdict
BASE_DIR=os.path.dirname(os.path.abspath(__file__))   # portable: everything is relative to this script
BASE=os.path.join(BASE_DIR,"extracts")
# ---- QUARTER: set Q_OVERRIDE to e.g. "Q4-26" to pin it; None = derive from the current-week snapshot date ----
_config_path=os.path.join(BASE_DIR,"reporting_config.json")
Q_OVERRIDE=json.load(open(_config_path)).get("quarter") if os.path.exists(_config_path) else None
if Q_OVERRIDE is not None and not re.fullmatch(r"Q[1-4]-\d{2}",Q_OVERRIDE):
    raise SystemExit("Invalid reporting quarter in reporting_config.json")
Q="Q3-26"; FC={"Closed","Commit"}   # Q is re-derived from CW below unless Q_OVERRIDE is set
# ---- DATE PINNING: set to None to auto-detect. Format "DD-MM-YYYY" ----
# Auto-detect rules: CW = latest complete file; Prior week = file immediately before CW;
# Prior month = file closest to (CW - 1 month); Quarter start = earliest file in CW's quarter.
CW_DATE=None
BASELINE_DATES={"prior_week":None,"prior_month":None,"quarter_start":None}
ADV={"Contract","Renewal","Pending Renewal","Purchased - Pending Review"}
NUM=["New Actual","New Open Opportunities","Cancel Actual","Cancels Open Opportunities","One Time Actual","One Time Open Opportunities"]
segc=lambda s:"R" if s=="Real Assets" else "P"
regc=lambda r:{"Americas":"Am","APAC":"Ap","EMEA":"Em"}.get(r,r)
segf={"R":"Real Assets","P":"Private Capital Solutions"}; regf={"Am":"Americas","Ap":"APAC","Em":"EMEA"}
REFS={}
_rf=BASE_DIR+"/refs_edwh.json"
_REFS_RAW=json.load(open(_rf)) if os.path.exists(_rf) else {}
_QRE=re.compile(r'^Q[1-4]-\d{2}$')
def load_refs(q):
    """EDWH #SF reference values (targets / prior-year actuals) for quarter q.
    refs_edwh.json may be either
      (a) quarter-keyed  : {"Q3-26": {"Real Assets|EMEA": {...}}, "Q4-26": {...}}   <- preferred, multi-quarter
      (b) flat (legacy)  : {"Real Assets|EMEA": {...}}                             <- assumed to be for q
    Missing quarter -> empty refs (targets/prior-year bars render as 0); refresh from EDWH #SF."""
    global REFS
    if not _REFS_RAW:
        REFS={}; print("WARNING: refs_edwh.json not found - targets/prior-year bars will be 0. Refresh from EDWH #SF."); return
    quarter_keyed=all(_QRE.match(k) for k in _REFS_RAW)
    src=_REFS_RAW.get(q,{}) if quarter_keyed else _REFS_RAW
    if quarter_keyed and not src:
        REFS={}; print("WARNING: refs_edwh.json has no block for %s (has: %s) - targets will be 0. Refresh from EDWH #SF."%(q,", ".join(sorted(_REFS_RAW))))
        return
    REFS={k:{kk:round(vv) for kk,vv in v.items()} for k,v in src.items()}
    print("REFS sourced from EDWH #SF (refs_edwh.json) for %s - %d segment/region blocks"%(q,len(REFS)))

def compute(pw_date, cw_date):
    pws=pw_date.strftime("%d-%m-%Y"); cws=cw_date.strftime("%d-%m-%Y")
    pw_short=pw_date.strftime("%d %b"); cw_short=cw_date.strftime("%d %b")
    fr=[]
    for wk,ds in [("PW",pws),("CW",cws)]:
        for seg,pfx in [("Real Assets","RA"),("Private Capital Solutions","PCS")]:
            d=pd.read_csv(f"{BASE}/{pfx}_{ds}.csv",dtype=str,keep_default_na=False); d["wk"]=wk; d["seg"]=seg
            for c in NUM: d[c]=pd.to_numeric(d[c],errors="coerce").fillna(0.0)
            fr.append(d)
    df=pd.concat(fr,ignore_index=True)
    df["region"]=df["Finance Region_Clean"]
    df["key"]=df["Account Number"].astype(str)+"-"+df["Opportunity Number"].astype(str)+"-"+df["Product Display Name Primary"].astype(str)
    df["isCAM"]=df["Child Account"].str.contains("CAM Placeholder",case=False,na=False)
    df["noQ3"]=df["New Open Opportunities"]*(df["Fiscal Quarter-Year"]==Q).astype(int)
    # ---- Deal quarter label: FOLLOW THE MONEY, not the row count ----
    # A deal key (account-opportunity-product) can carry several Fiscal Quarter-Year rows, and the
    # non-current-quarter ones are often $0 placeholders. A plain row-count mode then mislabels the
    # deal (e.g. one $0 Q2-26 row + one $775 Q3-26 row -> tie -> "Q2-26"). So weight each quarter by
    # the dollars sitting on it; only fall back to the row-count mode when the deal is $0 everywhere.
    # This also makes L2-vs-L4 correct: a deal whose dollars now sit in a later quarter reads as
    # Dropped/shifted rather than same-quarter Movement.
    df["_qw"]=df["New Open Opportunities"].abs()+df["New Actual"].abs()
    _qs=df.groupby(["key","wk","Fiscal Quarter-Year"],as_index=False)["_qw"].sum()
    # tie-break order: most dollars, then the current quarter Q, then the latest quarter label
    _qs["_pref"]=(_qs["Fiscal Quarter-Year"]==Q).astype(int)
    _qs=_qs.sort_values(["key","wk","_qw","_pref","Fiscal Quarter-Year"],ascending=[True,True,False,False,False])
    _dollar_q=_qs[_qs["_qw"]>0].drop_duplicates(["key","wk"]).set_index(["key","wk"])["Fiscal Quarter-Year"].to_dict()
    g=df.groupby(["key","wk"]).agg(
        acct=("Child Account","first"),owner=("Sales Owner Name","first"),seg=("seg","first"),region=("region","first"),
        subprod=("Sub Product New","first"),   # 1:1 with Product Display Name Primary (part of "key"), verified stable across snapshots
        qtr=("Fiscal Quarter-Year",lambda s:s.mode().iloc[0] if len(s.mode()) else ""),
        fc=("Forecast Category Name",lambda s:s.mode().iloc[0] if len(s.mode()) else ""),cam=("isCAM","max"),
        newopen=("New Open Opportunities","sum"),noQ3=("noQ3","sum"),newact=("New Actual","sum")).reset_index()
    _relab=sum(1 for k,w,q in zip(g["key"],g["wk"],g["qtr"]) if _dollar_q.get((k,w),q)!=q)
    g["qtr"]=[_dollar_q.get((k,w),q) for k,w,q in zip(g["key"],g["wk"],g["qtr"])]   # $-weighted label wins
    if _relab: print("  quarter label corrected by $-weighting on %d of %d deal-weeks"%(_relab,len(g)))
    pw=g[g.wk=="PW"].set_index("key"); cw=g[g.wk=="CW"].set_index("key")
    pwset=set(pw.index); cwset=set(cw.index); pwpos=set(pw[pw.newopen>0].index); allk=set(pw.index)|set(cw.index)
    def info(k):
        r=cw.loc[k] if k in cw.index else pw.loc[k]
        return r["acct"],r["owner"],segc(r["seg"]),regc(r["region"]),r["subprod"]
    # Per-deal records -> classify into the Q3 open-pipeline bridge for any forecast-category filter.
    # WF cols (13): seg,region, opening,conv,drop,lost,mov,new,push,catin,catout,closing, cam
    deals=[]; NWINS=[]; NWINSG=defaultdict(float); QS=set()
    for k in allk:
        inpw=k in pwset; incw=k in cwset; a,o,sg,rg,sp=info(k)
        camk=1 if ((inpw and pw.loc[k,"cam"]) or (incw and cw.loc[k,"cam"])) else 0
        pq=pw.loc[k,"qtr"] if inpw else ""; cq=cw.loc[k,"qtr"] if incw else ""
        if pq:QS.add(pq)
        if cq:QS.add(cq)
        ca=cw.loc[k,"newact"] if incw else 0.0
        pfc=pw.loc[k,"fc"] if inpw else ""; cfc=cw.loc[k,"fc"] if incw else ""
        ppq=pw.loc[k,"noQ3"] if inpw else 0.0; cpq=cw.loc[k,"noQ3"] if incw else 0.0
        deals.append((a,o,sg,rg,sp,camk,pq,cq,ca,pfc,cfc,ppq,cpq,inpw,incw,(k in pwpos)))
        if incw and not inpw and cq==Q and ca>0:
            NWINSG[(sg,rg,camk)]+=ca; NWINS.append([a,o,sg,rg,cfc,cq,round(ca),camk])
    NWINS.sort(key=lambda r:(-r[6],r))
    NWINSG=[[segf[s],regf.get(rg,rg),round(v),cam] for (s,rg,cam),v in sorted(NWINSG.items())]
    def classify(FCsel):   # FCsel=None -> All
        Cc=[];DR=[];LO=[];MV=[];NW=[];PU=[];CIN=[];COUT=[]
        WF=defaultdict(lambda:[0.0]*10)   # opening,conv,drop,lost,mov,new,push,catin,catout,closing
        # SPWF: identical bridge, additionally split by Sub Product New. Built in the SAME loop as WF
        # (every increment below is mirrored into SW right next to the W it comes from) so the two
        # can never drift apart on a future edit.
        SPWF=defaultdict(lambda:[0.0]*10)
        for (a,o,sg,rg,sp,camk,pq,cq,ca,pfc,cfc,ppq,cpq,inpw,incw,pwp) in deals:
            inCp = ppq>0 and (FCsel is None or pfc==FCsel)
            inCc = cpq>0 and (FCsel is None or cfc==FCsel)
            W=WF[(sg,rg,camk)]; SW=SPWF[(sg,rg,camk,sp)]
            if inCp: W[0]+=ppq; SW[0]+=ppq
            if inCc: W[9]+=cpq; SW[9]+=cpq
            if not inCp and not inCc: continue
            if inCp and inCc:
                if cfc=="Closed":
                    W[1]+=(cpq-ppq); SW[1]+=(cpq-ppq); Cc.append([a,o,sg,rg,pfc,pq,cq,round(ppq),round(ca),round(cpq-ppq),camk])
                else:
                    W[4]+=(cpq-ppq); SW[4]+=(cpq-ppq)
                    if round(cpq-ppq)!=0 or pfc!=cfc: MV.append([a,o,sg,rg,pfc,cfc,pq,cq,round(ppq),round(cpq),round(cpq-ppq),camk])
            elif inCp and not inCc:
                if not incw:
                    W[3]+=-ppq; SW[3]+=-ppq; LO.append([a,o,sg,rg,pfc,pq,round(ppq),round(-ppq),camk])
                elif cfc=="Closed":
                    W[1]+=-ppq; SW[1]+=-ppq; Cc.append([a,o,sg,rg,pfc,pq,cq,round(ppq),round(ca),round(cpq-ppq),camk])
                elif cpq>0 and cq==Q and (FCsel is not None) and cfc!=FCsel:
                    W[8]+=-ppq; SW[8]+=-ppq; COUT.append([a,o,sg,rg,pfc,cfc,cq,round(ppq),round(-ppq),camk])
                elif cq==Q:
                    W[4]+=(cpq-ppq); SW[4]+=(cpq-ppq)
                    if round(cpq-ppq)!=0 or pfc!=cfc: MV.append([a,o,sg,rg,pfc,cfc,pq,cq,round(ppq),round(cpq),round(cpq-ppq),camk])
                else:
                    W[2]+=-ppq; SW[2]+=-ppq; DR.append([a,o,sg,rg,pfc,Q,cq,round(ppq),round(-ppq),camk])
            else:   # inCc and not inCp
                if ppq==0:
                    if not pwp:
                        W[5]+=cpq; SW[5]+=cpq; NW.append([a,o,sg,rg,cfc,cq,round(cpq),camk])
                    else:
                        W[6]+=cpq; SW[6]+=cpq; PU.append([a,o,sg,rg,pfc,pq,Q,round(cpq),camk])
                else:   # was Q3 open but different category -> switched in
                    W[7]+=cpq; SW[7]+=cpq; CIN.append([a,o,sg,rg,pfc,cfc,cq,round(cpq),camk])
        Cc.sort(key=lambda r:(r[9],r)); DR.sort(key=lambda r:(r[8],r)); LO.sort(key=lambda r:(r[7],r)); MV.sort(key=lambda r:(-abs(r[10]),r)); NW.sort(key=lambda r:(-r[6],r)); PU.sort(key=lambda r:(-r[7],r)); CIN.sort(key=lambda r:(-r[7],r)); COUT.sort(key=lambda r:(r[8],r))
        WFl=[[segf[s],regf.get(rg,rg),round(w[0]),round(w[1]),round(w[2]),round(w[3]),round(w[4]),round(w[5]),round(w[6]),round(w[7]),round(w[8]),round(w[9]),cam] for (s,rg,cam),w in sorted(WF.items())]
        # SPWF cols (14): seg,region,subprod, opening,conv,drop,lost,mov,new,push,catin,catout,closing, cam
        SPWFl=[[segf[s],regf.get(rg,rg),sp,round(w[0]),round(w[1]),round(w[2]),round(w[3]),round(w[4]),round(w[5]),round(w[6]),round(w[7]),round(w[8]),round(w[9]),cam] for (s,rg,cam,sp),w in sorted(SPWF.items())]
        return {"WF":WFl,"SPWF":SPWFl,"C":Cc,"DR":DR,"LO":LO,"MV":MV,"NW":NW,"PU":PU,"CIN":CIN,"COUT":COUT}
    FCSETS={c:classify(None if c=="All" else c) for c in ["All","Commit","Best Case","Omitted"]}
    _b=FCSETS["All"]
    # top-level WF kept in ORIGINAL 11-col layout (drop the two category-flow cols, which are 0 for All)
    WF=[[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[11],r[12]] for r in _b["WF"]]
    # top-level SPWF: same idea, 12-col (seg,region,subprod,opening,conv,drop,lost,mov,new,push,closing,cam)
    SPWF=[[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[12],r[13]] for r in _b["SPWF"]]
    C=_b["C"]; DR=_b["DR"]; LO=_b["LO"]; MV=_b["MV"]; NW=_b["NW"]; PU=_b["PU"]
    QLIST=sorted([q for q in QS if q])
    q3=df[df["Fiscal Quarter-Year"]==Q].copy()
    gg=q3.groupby(["key","wk"]).agg(seg=("seg","first"),region=("region","first"),fc=("Forecast Category Name",lambda s:s.mode().iloc[0] if len(s.mode()) else ""),cam=("isCAM","max"),
        acct=("Child Account","first"),owner=("Sales Owner Name","first"),
        no=("New Open Opportunities","sum"),na=("New Actual","sum"),co=("Cancels Open Opportunities","sum"),cca=("Cancel Actual","sum"),oo=("One Time Open Opportunities","sum"),oa=("One Time Actual","sum")).reset_index()
    comp=defaultdict(lambda:{"RecCW":0,"RecPW":0,"CanCW":0,"CanPW":0,"OTCW":0,"OTPW":0})
    for _,r in gg.iterrows():
        key=(r["seg"],r["region"]); s=r["wk"]
        comp[key]["Can"+s]+=r["co"]+r["cca"]                       # Cancels: no forecast-category filter (all pipeline + actual)
        if r["fc"] in FC:                                          # Recurring & Non-Recurring: Actual + Open where fc in {Closed,Commit}
            comp[key]["Rec"+s]+=r["no"]+r["na"]; comp[key]["OT"+s]+=r["oo"]+r["oa"]
    summaryComp=[{"seg":sg,"region":rg,**{kk:round(vv) for kk,vv in v.items()}} for (sg,rg),v in sorted(comp.items())]
    def movers(oc,ac,filt=True):
        pwv=defaultdict(float); cwv=defaultdict(float)
        for _,r in gg.iterrows():
            if (not r["cam"]) and ((not filt) or (r["fc"] in FC)):
                ak=(r["acct"],r["owner"],r["seg"],r["region"]); val=r[oc]+r[ac]
                (pwv if r["wk"]=="PW" else cwv)[ak]+=val
        out=[]
        for ak in set(pwv)|set(cwv):
            v=cwv.get(ak,0)-pwv.get(ak,0)
            if abs(v)>=5000: a,o,sg,rg=ak; out.append([a,segc(sg),regc(rg),round(v),o])
        out.sort(key=lambda r:(-r[3],r)); return out
    MV_REC=movers("no","na",True); MV_CAN=movers("co","cca",False); MV_OT=movers("oo","oa",True)
    gl=q3[~q3.isCAM]; glo=[]
    for wk,lab in (("PW",pw_short),("CW",cw_short)):
        sub=gl[gl.wk==wk]
        for (sg,rg),grp in sub.groupby(["seg","region"]):
            openv=grp["New Open Opportunities"]+grp["One Time Open Opportunities"]
            fcn=grp["Forecast Category Name"]; st=grp["Stage Name"]
            glo.append([lab,segc(sg),regc(rg),round(grp["New Actual"].sum()+grp["One Time Actual"].sum()),
                round(openv[fcn=="Commit"].sum()),round(openv[fcn=="Best Case"].sum()),round(openv[fcn=="Omitted"].sum()),
                round(openv[(fcn.isin(["Commit","Best Case"]))&(st.isin(ADV))].sum()),round(openv[(fcn=="Omitted")&(st.isin(ADV))].sum())])
    return {"meta":{"pw":pw_date.strftime("%d %b %Y"),"cw":cw_date.strftime("%d %b %Y"),"quarter":Q,"weeks":[pw_short,cw_short]},
        "WF":WF,"SPWF":SPWF,"NWINSG":NWINSG,"C":C,"DR":DR,"LO":LO,"MV":MV,"NW":NW,"PU":PU,"NWINS":NWINS,"quarters":QLIST,
        "summaryComp":summaryComp,"MV_REC":MV_REC,"MV_CAN":MV_CAN,"MV_OT":MV_OT,"global":glo,"refs":REFS,"fc":FCSETS}

def global_for_date(date):
    fr=[]
    for pfx,seg in [("RA","Real Assets"),("PCS","Private Capital Solutions")]:
        d=pd.read_csv(f"{BASE}/{pfx}_{date.strftime('%d-%m-%Y')}.csv",dtype=str,keep_default_na=False)
        for c in ["New Actual","New Open Opportunities","One Time Actual","One Time Open Opportunities","Cancel Actual","Cancels Open Opportunities"]: d[c]=pd.to_numeric(d[c],errors="coerce").fillna(0.0)
        d["seg"]=seg; d["region"]=d["Finance Region_Clean"]; d["isCAM"]=d["Child Account"].str.contains("CAM Placeholder",case=False,na=False)
        fr.append(d)
    df=pd.concat(fr,ignore_index=True); q3a=df[df["Fiscal Quarter-Year"]==Q]; q3=q3a[~q3a["isCAM"]]
    campipe={}; camcancel={}
    for (sg,rg),grp in q3a[q3a["isCAM"]].groupby(["seg","region"]):
        campipe[(segc(sg),regc(rg))]=round((grp["New Open Opportunities"]).sum())
        camcancel[(segc(sg),regc(rg))]=round((grp["Cancel Actual"]+grp["Cancels Open Opportunities"]).sum())
    rows=[]
    for (sg,rg),grp in q3.groupby(["seg","region"]):
        openv=grp["New Open Opportunities"]; fcn=grp["Forecast Category Name"]; st=grp["Stage Name"]
        cancels=round((grp["Cancel Actual"]+grp["Cancels Open Opportunities"]).sum())   # no forecast-category filter (matches Summary page convention)
        rows.append([segc(sg),regc(rg),round(grp["New Actual"].sum()),
            round(openv[fcn=="Commit"].sum()),round(openv[fcn=="Best Case"].sum()),round(openv[fcn=="Omitted"].sum()),
            round(openv[(fcn.isin(["Commit","Best Case"]))&(st.isin(ADV))].sum()),round(openv[(fcn=="Omitted")&(st.isin(ADV))].sum()),
            campipe.get((segc(sg),regc(rg)),0),
            cancels, camcancel.get((segc(sg),regc(rg)),0)])
    return rows

def relabel_quarter(tpl,q):
    """The HTML templates carry baked-in Q3-26 (current) / Q3-25 (prior-year) labels, in three
    separator variants: '-', non-breaking hyphen and apostrophe. Retarget them to quarter q so the
    templates never need editing when the quarter rolls. Must run BEFORE the data is injected,
    otherwise genuine 'Q3-26' values inside the deal-level data would be rewritten too."""
    qn=int(q[1]); yy=int(q[3:])
    cy="%02d"%(yy%100); py="%02d"%((yy-1)%100)
    tpl=re.sub(r"Q3([-‑'])(26|25)",lambda m:"Q%d%s%s"%(qn,m.group(1),cy if m.group(2)=="26" else py),tpl)
    return re.sub(r"Q3(?![-‑'0-9])","Q%d"%qn,tpl)

def rawQ3open(date):
    tot=0.0; byseg=defaultdict(float)
    for pfx,seg in [("RA","Real Assets"),("PCS","Private Capital Solutions")]:
        d=pd.read_csv(f"{BASE}/{pfx}_{date.strftime('%d-%m-%Y')}.csv",dtype=str,keep_default_na=False)
        v=pd.to_numeric(d["New Open Opportunities"],errors="coerce").fillna(0.0)
        s=float(v[d["Fiscal Quarter-Year"]==Q].sum()); tot+=s; byseg[seg]+=s
    return tot,byseg
def rawQ3cancels(date):
    tot=0.0; byseg=defaultdict(float)
    for pfx,seg in [("RA","Real Assets"),("PCS","Private Capital Solutions")]:
        d=pd.read_csv(f"{BASE}/{pfx}_{date.strftime('%d-%m-%Y')}.csv",dtype=str,keep_default_na=False)
        ca=pd.to_numeric(d["Cancel Actual"],errors="coerce").fillna(0.0); co=pd.to_numeric(d["Cancels Open Opportunities"],errors="coerce").fillna(0.0)
        m=d["Fiscal Quarter-Year"]==Q; s=float((ca+co)[m].sum()); tot+=s; byseg[seg]+=s
    return tot,byseg
def rawQ3sales(date):
    # Sales trend total = QTD Actual (excl CAM) + Commit pipeline (excl CAM) + CAM Placeholder pipeline (any forecast category)
    tot=0.0; byseg=defaultdict(float)
    for pfx,seg in [("RA","Real Assets"),("PCS","Private Capital Solutions")]:
        d=pd.read_csv(f"{BASE}/{pfx}_{date.strftime('%d-%m-%Y')}.csv",dtype=str,keep_default_na=False)
        na=pd.to_numeric(d["New Actual"],errors="coerce").fillna(0.0); no=pd.to_numeric(d["New Open Opportunities"],errors="coerce").fillna(0.0)
        iscam=d["Child Account"].str.contains("CAM Placeholder",case=False,na=False); m=d["Fiscal Quarter-Year"]==Q
        s=float(na[m&~iscam].sum())+float(no[m&~iscam&(d["Forecast Category Name"]=="Commit")].sum())+float(no[m&iscam].sum())
        tot+=s; byseg[seg]+=s
    return tot,byseg
def validate_global(GLOBAL,dates_,glweeks):
    # Global page's region-stacked trend charts (Sales = QTD+Commit+CAM; Cancels = Cancel Actual+Cancels Open
    # Opportunities, no FC filter) tie to an INDEPENDENT raw Q3 recompute from the CSVs, for EVERY weekly
    # snapshot (not just the latest) -- catches regressions on any historical column, not only the current week.
    f=[]
    for dte,wk in zip(dates_,glweeks):
        for label,rawfn,cols in [("sales",rawQ3sales,(3,4,9)),("cancels",rawQ3cancels,(10,11))]:
            rt,rs=rawfn(dte); rows=[r for r in GLOBAL if r[0]==wk]
            # tolerance scales with row count: the GLOBAL side sums several independently-rounded
            # per-region numbers, the raw side rounds once at the end -- a few $ of drift is expected
            # (same rationale as check C's per-row rounding tolerance), not a real mismatch.
            tol=len(rows)+2
            gt=sum(sum(r[c] for c in cols) for r in rows)
            if abs(gt-rt)>tol: f.append("Global %s %s total $%.0f != raw Q3 $%.0f (diff $%.0f)"%(label,wk,gt,rt,gt-rt))
            for seg,rv in rs.items():
                segrows=[r for r in rows if r[1]==segc(seg)]
                gv=sum(sum(r[c] for c in cols) for r in segrows)
                if abs(gv-rv)>len(segrows)+2: f.append("Global %s %s %s $%.0f != raw $%.0f"%(label,wk,seg,gv,rv))
    return f
def validate(name,DD,pw_date,cw_date):
    f=[]; WF=DD["WF"]; Ssum=lambda i:sum(r[i] for r in WF)
    # A) waterfall bridge reconciles per segment/region/cam group
    for r in WF:
        d=(r[2]+r[3]+r[4]+r[5]+r[6]+r[7]+r[8])-r[9]
        if abs(d)>2: f.append("bridge %s/%s/cam%s off $%.0f"%(r[0],r[1],r[10],d))
    # B) Opening/Closing == INDEPENDENT raw Q3 recompute from the CSVs (total + per segment)
    for lab,dd,idx in [("Opening",pw_date,2),("Closing",cw_date,9)]:
        rt,rs=rawQ3open(dd); gt=Ssum(idx)
        if abs(gt-rt)>2: f.append("%s total $%.0f != raw Q3 $%.0f (diff $%.0f)"%(lab,gt,rt,gt-rt))
        for seg,rv in rs.items():
            gv=sum(r[idx] for r in WF if r[0]==seg)
            if abs(gv-rv)>2: f.append("%s %s $%.0f != raw $%.0f"%(lab,seg,gv,rv))
    # C) each detail table total == its waterfall bar (tolerance = per-row rounding)
    tie=[("L1 Converted",sum(r[9] for r in DD["C"]),Ssum(3),len(DD["C"])),("L2 Dropped",sum(r[8] for r in DD["DR"]),Ssum(4),len(DD["DR"])),
         ("L3 Lost",sum(r[7] for r in DD["LO"]),Ssum(5),len(DD["LO"])),("L4 Movement",sum(r[10] for r in DD["MV"]),Ssum(6),len(DD["MV"])),
         ("L5 New",sum(r[6] for r in DD["NW"]),Ssum(7),len(DD["NW"])),("L6 Pushed",sum(r[7] for r in DD["PU"]),Ssum(8),len(DD["PU"])),
         ("L7 New Wins",sum(r[6] for r in DD["NWINS"]),sum(r[2] for r in DD["NWINSG"]),len(DD["NWINS"]))]
    for nm,dv,bv,nr in tie:
        if abs(dv-bv)>nr+2: f.append("%s detail $%.0f != bar $%.0f"%(nm,dv,bv))
    # D) sign sanity: out-flows <=0, in-flows >=0, opening positive
    for lab,idx,sign in [("Converted L1",3,-1),("Dropped L2",4,-1),("Lost L3",5,-1),("New L5",7,1),("Pushed L6",8,1)]:
        v=Ssum(idx)
        if sign<0 and v>2: f.append("%s should be <=0 got $%.0f"%(lab,v))
        if sign>0 and v<-2: f.append("%s should be >=0 got $%.0f"%(lab,v))
    if Ssum(2)<=0: f.append("Opening pipeline not positive")
    # E) Sub Product breakdown (SPWF, 12-col: seg,region,subprod,opening,conv,drop,lost,mov,new,push,closing,cam):
    # bridge reconciles per seg/region/cam/subproduct row
    SPWF=DD.get("SPWF",[])
    for r in SPWF:
        d=(r[3]+r[4]+r[5]+r[6]+r[7]+r[8]+r[9])-r[10]
        if abs(d)>2: f.append("subproduct bridge %s/%s/%s/cam%s off $%.0f"%(r[0],r[1],r[2],r[11],d))
    # F) Sub Product breakdown ties back to the (already-validated) segment-level WF (11-col: seg,region,
    # opening,conv,drop,lost,mov,new,push,closing,cam) -- summed across subproduct and region, Opening/
    # Closing must equal the plain WF total for that segment/cam.
    for spidx,wfidx,lab in [(3,2,"Opening"),(10,9,"Closing")]:
        for seg in ("Real Assets","Private Capital Solutions"):
            for cam in (0,1):
                spv=sum(r[spidx] for r in SPWF if r[0]==seg and r[11]==cam)
                wfv=sum(r[wfidx] for r in WF if r[0]==seg and r[10]==cam)
                if abs(spv-wfv)>2: f.append("subproduct %s %s/cam%s $%.0f != segment total $%.0f"%(lab,seg,cam,spv,wfv))
    return f

dates=set()
for f in os.listdir(BASE):
    m=re.search(r'(?:RA|PCS)_(\d{2}-\d{2}-\d{4})\.csv',f)
    if m: dates.add(dt.datetime.strptime(m.group(1),"%d-%m-%Y").date())
def has_both(d):
    s=d.strftime("%d-%m-%Y"); return os.path.exists(f"{BASE}/RA_{s}.csv") and os.path.exists(f"{BASE}/PCS_{s}.csv")
dates=sorted([d for d in dates if has_both(d)])
def _pd(x): return dt.datetime.strptime(x,"%d-%m-%Y").date()
cw_date=_pd(CW_DATE) if CW_DATE else max(dates)
# ---- Quarter: derived from the CW snapshot date (fiscal = calendar at MSCI) unless pinned ----
Q=Q_OVERRIDE or "Q%d-%02d"%((cw_date.month-1)//3+1, cw_date.year%100)
_qs=set()
for _pfx in ("RA","PCS"):
    _p="%s/%s_%s.csv"%(BASE,_pfx,cw_date.strftime("%d-%m-%Y"))
    if os.path.exists(_p): _qs|=set(pd.read_csv(_p,dtype=str,usecols=["Fiscal Quarter-Year"])["Fiscal Quarter-Year"].dropna())
if _qs and Q not in _qs:
    raise SystemExit("Derived quarter %s is not present in the CW extract (found: %s). Set Q_OVERRIDE at the top of build_wow.py."%(Q,", ".join(sorted(_qs))))
print("Quarter:",Q,"(derived from CW %s)"%cw_date.strftime("%d-%m-%Y") if not Q_OVERRIDE else "(pinned via Q_OVERRIDE)")
load_refs(Q)
def prev_snap(target):   # file immediately before target (second-latest when target=CW)
    c=[d for d in dates if d<target]; return max(c) if c else min(dates)
def minus_month(d):      # same day one month earlier (clamped to valid day)
    y,m=(d.year,d.month-1) if d.month>1 else (d.year-1,12)
    return dt.date(y,m,min(d.day,calendar.monthrange(y,m)[1]))
def closest(target):     # available file closest to target (abs day diff; ties -> earlier)
    return min(dates,key=lambda x:(abs((x-target).days),x))
qm=(int(Q[1])-1)*3+1
qyear=2000+int(Q[3:])
qcand=[d for d in dates if d.year==qyear and qm<=d.month<=qm+2]
pw_week=_pd(BASELINE_DATES["prior_week"]) if BASELINE_DATES.get("prior_week") else prev_snap(cw_date)
qstart=_pd(BASELINE_DATES["quarter_start"]) if BASELINE_DATES.get("quarter_start") else (min(qcand) if qcand else min(dates))
# Prior month: only once CW is past the FIRST month of the quarter (before that, one-month-prior would be the previous quarter). Pick the closest IN-QUARTER file to (CW - 1 month).
if BASELINE_DATES.get("prior_month"):
    pmonth=_pd(BASELINE_DATES["prior_month"])
elif cw_date.month>qm:
    tgt=minus_month(cw_date); pmcand=qcand or dates
    pmonth=min(pmcand,key=lambda x:(abs((x-tgt).days),x))
else:
    pmonth=None
_missing=[d for d in ([cw_date,pw_week,qstart]+([pmonth] if pmonth else [])) if not has_both(d)]
if _missing:
    raise SystemExit("Missing extract files for: "+", ".join(d.strftime("%d-%m-%Y") for d in _missing)+" -- drop RA_/PCS_ CSVs for those dates in extracts/ and rerun.")
plan=[("prior_week","Prior week",pw_week)]
# Drop Prior month when it resolves to the same snapshot as Prior week or Quarter start (would be a duplicate baseline option).
if pmonth is not None and pmonth not in (pw_week,qstart): plan.append(("prior_month","Prior month",pmonth))
elif pmonth is not None: print("Prior month baseline skipped: resolves to the same snapshot as %s"%("Prior week" if pmonth==pw_week else "Quarter start"))
plan.append(("quarter_start","Quarter start",qstart))
baselines={}; options=[]; ALLFAILS=[]
REP=["PA WoW - BUILD VALIDATION REPORT","Generated: "+dt.datetime.now().strftime("%Y-%m-%d %H:%M"),"Current week (fixed): "+cw_date.strftime("%d %b %Y")+"  |  Quarter: "+Q,
 "Checks run per baseline: (A) waterfall bridge reconciles per segment/region, (B) Opening & Closing match an INDEPENDENT raw Q3 recompute from the CSVs (total + per segment), (C) every detail table total = its waterfall bar, (D) sign sanity (out-flows<=0, in-flows>=0)."]
for key,label,d in plan:
    DD=compute(d,cw_date); baselines[key]=DD
    options.append({"key":key,"label":label,"date":d.strftime("%d %b %Y")})
    fails=validate(label,DD,d,cw_date); ALLFAILS+=["[%s] %s"%(label,x) for x in fails]
    WF=DD["WF"]; M=lambda i:"$%.3fM"%(sum(r[i] for r in WF)/1e6)
    ropen,_=rawQ3open(d); rclose,_=rawQ3open(cw_date); brk=(sum(r[2] for r in WF)+sum(r[3] for r in WF)+sum(r[4] for r in WF)+sum(r[5] for r in WF)+sum(r[6] for r in WF)+sum(r[7] for r in WF)+sum(r[8] for r in WF))-sum(r[9] for r in WF)
    REP+=["", "="*66, "BASELINE: %s   (Prior %s  ->  Current %s)"%(label,d.strftime("%d %b %Y"),cw_date.strftime("%d %b %Y")),
      "  RESULT: "+("PASS - all checks OK" if not fails else "*** FAIL - %d issue(s) ***"%len(fails)),
      "  Opening pipeline : %-10s (raw Q3 from file: $%.3fM)"%(M(2),ropen/1e6),
      "    - L1 Converted to Actual   : "+M(3),
      "    - L2 Dropped (shifted out) : "+M(4),
      "    - L3 Lost                  : "+M(5),
      "    - L4 Movement              : "+M(6),
      "    - L5 New Pipeline          : "+M(7),
      "    - L6 Pushed / Brought fwd  : "+M(8),
      "  Closing pipeline : %-10s (raw Q3 from file: $%.3fM)"%(M(9),rclose/1e6),
      "  L7 New Wins (separate)       : $%.3fM"%(sum(r[2] for r in DD["NWINSG"])/1e6),
      "  Bridge (Opening + L1..L6 = Closing): "+("OK, residual $%.0f"%brk if abs(brk)<len(WF)+2 else "MISMATCH $%.0f"%brk)]
    if fails: REP+=["  ISSUES FOUND:"]+["    - "+x for x in fails]
    print("  "+label+": "+("PASS" if not fails else "FAIL (%d)"%len(fails)))
GLOBAL=[]; GLWEEKS=[]
for dte in dates:
    lab=dte.strftime("%d %b"); GLWEEKS.append(lab)
    for row in global_for_date(dte): GLOBAL.append([lab]+row)
print("Global time-series columns:",GLWEEKS)
_glfails=validate_global(GLOBAL,dates,GLWEEKS); ALLFAILS+=["[Global] %s"%x for x in _glfails]
REP+=["","="*66,"GLOBAL PAGE: Sales & Cancels trend charts vs independent raw Q3 recompute, all %d weekly columns"%len(GLWEEKS),
  "  RESULT: "+("PASS - all checks OK" if not _glfails else "*** FAIL - %d issue(s) ***"%len(_glfails))]
if _glfails: REP+=["  ISSUES FOUND:"]+["    - "+x for x in _glfails]
print("  Global (Sales & Cancels trend, all weeks): "+("PASS" if not _glfails else "FAIL (%d)"%len(_glfails)))
REP+=["","="*66,"OVERALL: "+("ALL CHECKS PASSED - dashboard numbers verified against source." if not ALLFAILS else "FAILURES FOUND (%d) - review above BEFORE sharing the dashboard."%len(ALLFAILS))]
open(BASE_DIR+"/_validation_report.txt","w",encoding="utf-8").write("\n".join(REP))
print("Validation report written -> _validation_report.txt  ["+("PASS" if not ALLFAILS else "FAIL")+"]")
WD={"cw":cw_date.strftime("%d %b %Y"),"quarter":Q,"default":"prior_week","options":options,"baselines":baselines,"global":GLOBAL,"globalWeeks":GLWEEKS}
DATAJS="const WOW_DATA="+json.dumps(WD)+";"
for tname,out in [("_dash_template.html","PA_WoW_Dashboard.html"),("_demo_template.html","demo_Wow.html")]:
    tpl=open(BASE_DIR+"/"+tname,encoding="utf-8").read()
    assert "__WOWDATA__" in tpl and tpl.rstrip().endswith("</html>") and "renderAll();" in tpl, f"TEMPLATE INCOMPLETE ({tname})"
    tpl=relabel_quarter(tpl,Q)   # retarget the templates' baked-in Q3-26 / Q3-25 labels (BEFORE data injection)
    html=tpl.replace("__WOWDATA__","<script>"+DATAJS+"</script>")
    open(BASE_DIR+"/"+out,"w",encoding="utf-8").write(html)
    print(out,"bytes",len(html))
print("CW:",cw_date.strftime("%d %b %Y"),"| baselines:",[(o['label'],o['date']) for o in options])
for k,DD in baselines.items():
    wf=DD["WF"]; ok=all(abs(sum(r[2:9])-r[9])<=2 for r in wf)
    S=lambda i:round(sum(r[i] for r in wf))
    print(" ",k,"| reconciles",ok,"| Open",S(2),"Conv",S(3),"Dropped",S(4),"Lost",S(5),"Move",S(6),"New",S(7),"Push",S(8),"Close",S(9),
          "| detail tie: C",round(sum(r[9] for r in DD["C"])),"DR",round(sum(r[8] for r in DD["DR"])),"LO",round(sum(r[7] for r in DD["LO"])),"MV",round(sum(r[10] for r in DD["MV"])),"NW",round(sum(r[6] for r in DD["NW"])),"PU",round(sum(r[7] for r in DD["PU"])),"NWINS",round(sum(r[6] for r in DD["NWINS"])))
