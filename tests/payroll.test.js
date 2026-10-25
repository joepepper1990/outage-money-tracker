import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_PROFILE, roundMoney, payDateForMonth, taxPeriodForDate, codeFreePayAnnual,
  cumulativePayeDue, employeeNI, holidayBonusFromQualifyingOt, emergencyForMonth,
  payrollForMonth, qualifyingOtPaidInYear, overtimeForPayMonth, salaryAt, dealArrearsForPayMonth
} from '../js/payroll.js';

const close=(a,b,eps=.011)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const recurring=[
  {id:'breakdown',name:'Breakdown',amount:8.24,startPayMonth:'2026-04',endPayMonth:'2026-10',reducesCash:true,reducesPaye:true,reducesNi:true,taxableBenefit:true},
  {id:'tech',name:'Technology',amount:67.92,startPayMonth:'2026-04',endPayMonth:'2026-11',reducesCash:true,reducesPaye:true,reducesNi:true,taxableBenefit:true}
];
const baseState={profile:{...BASE_PROFILE},periods:[],standbyClaims:[],payDeals:[],payrollEvents:[],recurringItems:recurring,actuals:[]};

test('pay date moves weekend and bank holiday backwards',()=>{
  assert.equal(payDateForMonth('2026-11',BASE_PROFILE),'2026-11-20');
  assert.equal(payDateForMonth('2025-04',BASE_PROFILE),'2025-04-17');
});

test('PAYE code free pay and cumulative calculations reproduce Sept/Oct 2026 YTD tax',()=>{
  assert.equal(codeFreePayAnnual('1257L'),12579);
  const rules={basicBand:37700,additionalThreshold:125140};
  assert.equal(cumulativePayeDue(36207,6,'1257L',rules),8196.80);
  assert.equal(cumulativePayeDue(47980.49,7,'1257L',rules),11858.46);
});

test('category A NI reproduces clean and overtime months',()=>{
  const rules={niPT:1048,niUEL:4189,niMain:.08,niUpper:.02};
  assert.equal(employeeNI(5508.52,'A',rules),277.67);
  assert.equal(employeeNI(11697.33,'A',rules),401.45);
});

test('emergency payment uses exact annual penny balancing',()=>{
  const vals=['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'].map(m=>emergencyForMonth(m,baseState));
  assert.equal(roundMoney(vals.reduce((a,b)=>a+b,0)),614);
  assert.equal(vals.filter(x=>x===51.17).length,8);
  assert.equal(vals.filter(x=>x===51.16).length,4);
  assert.equal(emergencyForMonth('2026-09',baseState),51.17);
  assert.equal(emergencyForMonth('2026-10',baseState),51.17);
});

test('holiday bonus exactly reproduces 2025 qualifying overtime case',()=>{
  assert.equal(holidayBonusFromQualifyingOt(6161.88),513.49);
});

test('September 2026 clean forecast reproduces EDF payslip from August anchor',()=>{
  const state={...baseState,actuals:[{payMonth:'2026-08',ytdTaxable:30622.32,ytdTax:7010.73,ytdNi:1442.33,ytdPension:2243.30}]};
  const x=payrollForMonth('2026-09',state);
  assert.equal(x.basicPay,5982.17);assert.equal(x.emergencyPay,51.17);assert.equal(x.pension,448.66);
  assert.equal(x.grossTaxable,5508.52);assert.equal(x.taxableBenefits,76.16);assert.equal(x.ytdTaxable,36207.00);
  assert.equal(x.payeTax,1186.07);assert.equal(x.employeeNi,277.67);assert.equal(x.netPay,4044.78);
});

test('October 2026 forecast reproduces EDF high-OT payslip from September anchor',()=>{
  const periods=[];
  periods.push({id:'a',date:'2026-09-10',start:'00:00',end:'23:00',multiplier:1.5});
  periods.push({id:'b',date:'2026-09-11',start:'00:00',end:'18:30',multiplier:1.5});
  periods.push({id:'c',date:'2026-09-12',start:'00:00',end:'23:00',multiplier:2});
  periods.push({id:'d',date:'2026-09-13',start:'00:00',end:'22:00',multiplier:2});
  const state={...baseState,periods,standbyClaims:[{id:'s',date:'2026-09-25',units:13}],actuals:[{payMonth:'2026-09',ytdTaxable:36207,ytdTax:8196.80,ytdNi:1720,ytdPension:2691.96}]};
  const ot=overtimeForPayMonth('2026-10',state);close(ot.h15,41.5);close(ot.h2,45);close(ot.pay15,2316.26);close(ot.pay2,3348.78);
  const x=payrollForMonth('2026-10',state);
  assert.equal(x.standbyPay,523.77);assert.equal(x.grossTaxable,11697.33);assert.equal(x.taxableBenefits,76.16);assert.equal(x.ytdTaxable,47980.49);
  assert.equal(x.payeTax,3661.66);assert.equal(x.employeeNi,401.45);assert.equal(x.netPay,7634.22);
});

test('qualifying overtime uses actual paid months where available',()=>{
  const state={...baseState,actuals:[{payMonth:'2026-08',ot15Pay:223.26,ot2Pay:0},{payMonth:'2026-09',ot15Pay:0,ot2Pay:0},{payMonth:'2026-10',ot15Pay:2316.26,ot2Pay:3348.78}]};
  assert.equal(qualifyingOtPaidInYear(2026,state),5888.30);
});

test('pay deals support compounded and deal-start percentage stages',()=>{
  const compound={...baseState,payDeals:[{id:'d1',name:'deal',agreedDate:'2027-06-01',components:[{type:'percent',effectiveDate:'2027-04-06',value:4,basis:'current'},{type:'percent',effectiveDate:'2027-09-01',value:1,basis:'current'}]}]};
  close(salaryAt('2027-10-01',compound),71786*1.04*1.01,.02);
  const nonCompound={...baseState,payDeals:[{id:'d1',name:'deal',agreedDate:'2027-06-01',components:[{type:'percent',effectiveDate:'2027-04-06',value:4,basis:'current'},{type:'percent',effectiveDate:'2027-09-01',value:1,basis:'deal-start'}]}]};
  close(salaryAt('2027-10-01',nonCompound),71786*1.05,.02);
});

test('late consolidated deal creates salary and pension arrears in selected payroll month',()=>{
  const s={...baseState,payDeals:[{id:'d1',name:'2027',agreedDate:'2027-06-15',arrearsPayMonth:'2027-07',components:[{type:'percent',effectiveDate:'2027-04-06',value:3,basis:'current'}]}]};
  const a=dealArrearsForPayMonth('2027-07',s);
  assert.ok(a.salary>530&&a.salary<550);
  close(a.pension,a.salary*.075,.03);
  assert.ok(a.emergency>0);
});

test('breakdown ends after October and technology after November',()=>{
  const anchor={payMonth:'2026-10',ytdTaxable:47980.49,ytdTax:11858.46,ytdNi:2121.45,ytdPension:3140.62};
  const s={...baseState,actuals:[anchor]};
  const nov=payrollForMonth('2026-11',s),dec=payrollForMonth('2026-12',s);
  assert.equal(nov.recurringDeductions,67.92);
  assert.equal(dec.recurringDeductions,0);
});


test('effective emergency and pager overrides are used and continue scaling with later pay deals',()=>{
  const s={...baseState,
    payrollEvents:[
      {id:'e',eventType:'emergency_annual',effectiveDate:'2027-05-01',valueNumeric:660},
      {id:'p',eventType:'standby_daily',effectiveDate:'2027-05-01',valueNumeric:42}
    ],
    payDeals:[{id:'d',name:'later rise',agreedDate:'2027-08-01',components:[{type:'percent',effectiveDate:'2027-09-01',value:2,basis:'current'}]}]
  };
  close(emergencyForMonth('2027-05',s),55,.02);
  close(emergencyForMonth('2027-09',s),56.10,.02);
  close((await import('../js/payroll.js')).standbyRateAt('2027-05-15',s),42,.001);
  close((await import('../js/payroll.js')).standbyRateAt('2027-09-15',s),42.84,.01);
});
