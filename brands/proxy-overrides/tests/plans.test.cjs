const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyNovapiBrand } = require('../novapi/server.js');
const { transformStatus } = require('../dianapi/server.cjs');

for (const [brand, transform] of [['novapi', applyNovapiBrand], ['dianapi', transformStatus]]) {
  test(`${brand} forces plans off through the shared navigation configuration`, () => {
    const incoming = {home:false, rankings:{enabled:false,requireAuth:true}, custom:false, plans:{enabled:true,requireAuth:false}};
    const result = transform({success:true,data:{HeaderNavModules:JSON.stringify(incoming)}});
    const nav = JSON.parse(result.data.HeaderNavModules);
    assert.deepEqual(nav.plans,{enabled:false,requireAuth:true});
    assert.equal(nav.home,false);
    assert.equal(nav.custom,false);
    assert.deepEqual(nav.rankings,incoming.rankings);
  });
  test(`${brand} closes plans even when upstream configuration is missing or invalid`, () => {
    for (const raw of [undefined, '', 'invalid', 'null']) {
      const result = transform({success:true,data:{HeaderNavModules:raw}});
      assert.deepEqual(JSON.parse(result.data.HeaderNavModules).plans,{enabled:false,requireAuth:true});
    }
  });
}
