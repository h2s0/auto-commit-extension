import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {filesFor,validateSubmission,validateSettings} from '../src/shared/format.ts';
import {defaults, type Submission} from '../src/shared/types.ts';
const submission: Submission = {submissionId:'123',accepted:true,problem:{frontendId:'1',title:'Two Sum',titleSlug:'two-sum',url:'https://leetcode.com/problems/two-sum/',difficulty:'Easy'},language:'python3',code:'print("안녕")',runtime:'42 ms'};
const settings = {...defaults,owner:'octocat',repo:'solutions'};
test('Python source and metadata use canonical paths',()=>{const files=filesFor(submission,settings);assert.equal(files['LeetCode/0001-two-sum/solution.py'],submission.code);assert.match(files['LeetCode/0001-two-sum/README.md'],/42 ms/);});
test('JavaScript and unknown languages use correct extensions',()=>{assert.ok(filesFor({...submission,language:'javascript'},settings)['LeetCode/0001-two-sum/solution.js']);assert.ok(filesFor({...submission,language:'unknown'},settings)['LeetCode/0001-two-sum/solution.txt']);});
test('README and metrics switches respected',()=>{assert.equal(Object.keys(filesFor(submission,{...settings,createReadme:false})).length,1);assert.doesNotMatch(filesFor(submission,{...settings,includeMetrics:false})['LeetCode/0001-two-sum/README.md'],/Runtime/);});
test('reject failed submissions and unsafe paths',()=>{assert.throws(()=>validateSubmission({...submission,accepted:false} as unknown as Submission));assert.throws(()=>validateSettings({...settings,baseDirectory:'../bad'}));assert.throws(()=>validateSubmission({...submission,problem:{...submission.problem,titleSlug:'../bad'}}));});

test('failed attempts preserve accepted solution and label verdict in README',()=>{
 const failed={...submission,accepted:false,statusCode:11,statusMessage:'Wrong Answer'};
 const files=filesFor(failed,{...settings,includeFailed:true});
 assert.equal(files['LeetCode/0001-two-sum/solution.py'],undefined);
 assert.equal(files['LeetCode/0001-two-sum/attempts/123/solution.py'],submission.code);
 assert.match(files['LeetCode/0001-two-sum/attempts/123/README.md'],/Status: Wrong Answer/);
});
test('multiple destinations validate independently and duplicate repo/branch is rejected',()=>{
 const targets=[{owner:'octocat',repo:'personal',branch:''},{owner:'study',repo:'solutions',branch:'heesae'}];
 assert.doesNotThrow(()=>validateSettings({...settings,targets}));
 assert.throws(()=>validateSettings({...settings,targets:[targets[0],{...targets[0],branch:'main'}]}));
 assert.throws(()=>validateSettings({...settings,targets:[{...targets[0],branch:'../bad'}]}));
});
