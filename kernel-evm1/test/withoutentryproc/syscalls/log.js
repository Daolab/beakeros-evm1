const debug = require('debug')
const assert = require('assert')

const Kernel = artifacts.require('./TestKernel.sol')
const abi = require('ethereumjs-abi')

const beakerlib = require("../../../beakerlib");
const testutils = require("../../testutils.js");

// Valid Contracts
const Valid = {
    Adder: artifacts.require('test/valid/Adder.sol'),
    Multiply: artifacts.require('test/valid/Multiply.sol'),
    Divide: artifacts.require('test/valid/Divide.sol'),
    SysCallTestWrite: artifacts.require('test/valid/SysCallTestWrite.sol'),
    SysCallTestLog: artifacts.require('test/valid/SysCallTestLog.sol'),
}

const Invalid = {
    Simple: artifacts.require('test/invalid/Simple.sol')
}

contract('Kernel without entry procedure', function (accounts) {
    describe('Log capability', function () {
        const procName = "SysCallTestLog";
        const contract = Valid.SysCallTestLog;
        const bytecode = Valid.SysCallTestLog.bytecode;
        describe('A() No topics', function () {
            const functionSpec = "A()";
            it('A() should succeed when given "*" cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(valueX.toNumber(), 0, "should succeed with zero errcode the first time");
                assert.equal(tx.receipt.logs[0].data, "0x0000000000000000000000000000000000000000000000000000001234567890", "should succeed with correct value the first time");
                assert.equal(tx.receipt.logs[0].topics.length,0,"There should not be any topics");
            })
            it('A() should fail when not given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const capArray = beakerlib.Cap.toInput([cap1]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx0 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('A() should fail when cap requires more topics', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap(["0xaabb"]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx0 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                // need to have the ABI definition in JSON as per specification
                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");
                // 4 is the error code we are after
                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "should fail with correct error code");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
        })
        describe('B() Single topic', function () {
            const functionSpec = "B()";
            // This topic is also defined in the Solidity file and
            // must be the same
            const topic = "0xabcd";
            it('B() should succeed when given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([topic]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");
                assert.equal(valueX.toNumber(), 0, "errcode should be correct");

                assert.equal(tx.receipt.logs[0].data, "0x0000000000000000000000000000000000000000000000000000001234567890", "should succeed with correct value the first time");
                assert.equal(tx.receipt.logs[0].topics.length,1,"There should be 1 topic");
                assert.equal(tx.receipt.logs[0].topics[0],"0x"+topic.slice(2).padStart(64,0),"The topic should be correct");
            })
            it('B() should fail when cap has incorrect topic', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([topic+"1"]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('B() should fail when not given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, []);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, []);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('B() should fail when trying to log to something outside its capability', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap = new beakerlib.LogCap(["0x8001", "0x0"]);
                const capArray = beakerlib.Cap.toInput([cap]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, capArray);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                // need to have the ABI definition in JSON as per specification
                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
        })
        describe('C() Two topics', function () {
            const functionSpec = "C()";
            // This topic is also defined in the Solidity file and
            // must be the same
            const topic0 = "0xabcd";
            const topic1 = "0xbeef";
            it('C() should succeed when given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([topic0, topic1]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");
                assert.equal(valueX.toNumber(), 0, "errcode should be correct");

                assert.equal(tx.receipt.logs[0].data, "0x0000000000000000000000000000000000000000000000000000001234567890", "should succeed with correct value the first time");
                assert.equal(tx.receipt.logs[0].topics.length,2,"There should be 2 topics");
                assert.equal(tx.receipt.logs[0].topics[0],"0x"+topic0.slice(2).padStart(64,0),"The topic0 should be correct");
                assert.equal(tx.receipt.logs[0].topics[1],"0x"+topic1.slice(2).padStart(64,0),"The topic1 should be correct");
            })
            it('C() should fail when not given cap', async function () {
                const kernel = await testutils.deployTestKernel();

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, []);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, []);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('C() should fail when trying to log to something outside its capability', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap = new beakerlib.LogCap(["0x8001", "0x0"]);
                const capArray = beakerlib.Cap.toInput([cap]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, capArray);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
        })
        describe('D() Three topics', function () {
            const functionSpec = "D()";
            // This topic is also defined in the Solidity file and
            // must be the same
            const topic0 = "0xabcd";
            const topic1 = "0xbeef";
            const topic2 = "0xcafe";
            it('D() should succeed when given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([topic0, topic1, topic2]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");
                assert.equal(valueX.toNumber(), 0, "errcode should be correct");

                assert.equal(tx.receipt.logs[0].data, "0x0000000000000000000000000000000000000000000000000000001234567890", "should succeed with correct value the first time");
                assert.equal(tx.receipt.logs[0].topics.length,3,"There should be 3 topics");
                assert.equal(tx.receipt.logs[0].topics[0],"0x"+topic0.slice(2).padStart(64,0),"The topic0 should be correct");
                assert.equal(tx.receipt.logs[0].topics[1],"0x"+topic1.slice(2).padStart(64,0),"The topic1 should be correct");
                assert.equal(tx.receipt.logs[0].topics[2],"0x"+topic2.slice(2).padStart(64,0),"The topic1 should be correct");
            })
            it('D() should fail when not given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, []);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, []);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('D() should fail when trying to log to something outside its capability', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap = new beakerlib.LogCap(["0x8001", "0x0"]);
                const capArray = beakerlib.Cap.toInput([cap]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, capArray);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
        })
        describe('E() Four topics', function () {
            const functionSpec = "E()";
            // This topic is also defined in the Solidity file and
            // must be the same
            const topic0 = "0xabcd";
            const topic1 = "0xbeef";
            const topic2 = "0xcafe";
            const topic3 = "0x4545";
            it('E() should succeed when given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap1 = new beakerlib.WriteCap(0x8500,2);
                const cap2 = new beakerlib.LogCap([topic0, topic1, topic2, topic3]);
                const capArray = beakerlib.Cap.toInput([cap1, cap2]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const tx1 = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx = await kernel.executeProcedure(procName, functionSpec, "");
                assert.equal(valueX.toNumber(), 0, "errcode should be correct");

                assert.equal(tx.receipt.logs[0].data, "0x0000000000000000000000000000000000000000000000000000001234567890", "should succeed with correct value the first time");
                assert.equal(tx.receipt.logs[0].topics.length,4,"There should be 4 topics");
                assert.equal(tx.receipt.logs[0].topics[0],"0x"+topic0.slice(2).padStart(64,0),"The topic0 should be correct");
                assert.equal(tx.receipt.logs[0].topics[1],"0x"+topic1.slice(2).padStart(64,0),"The topic1 should be correct");
                assert.equal(tx.receipt.logs[0].topics[2],"0x"+topic2.slice(2).padStart(64,0),"The topic1 should be correct");
                assert.equal(tx.receipt.logs[0].topics[3],"0x"+topic3.slice(2).padStart(64,0),"The topic1 should be correct");
            })
            it('E() should fail when not given cap', async function () {

                const kernel = await testutils.deployTestKernel();

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, []);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, []);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
            it('E() should fail when trying to log to something outside its capability', async function () {

                const kernel = await testutils.deployTestKernel();

                const cap = new beakerlib.LogCap(["0x8001", "0x0"]);
                const capArray = beakerlib.Cap.toInput([cap]);

                const deployedContract = await testutils.deployedTrimmed(contract);
                const [, address] = await kernel.registerProcedure.call(procName, deployedContract.address, capArray);
                const tx = await kernel.registerProcedure(procName, deployedContract.address, capArray);

                const valueX = await kernel.executeProcedure.call(procName, functionSpec, "");
                const tx1 = await kernel.executeProcedure(procName, functionSpec, "");

                assert.equal(web3.toHex(valueX).slice(0,4), "0x55", "errcode should be correct");
                assert.equal(tx1.receipt.logs.length, 0, "Nothing should be logged");
            })
        })
    })
})
