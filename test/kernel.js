const debug = require('debug')
const assert = require('assert')

const Kernel = artifacts.require('./Kernel.sol')
const abi = require('ethereumjs-abi')

// Valid Contracts
const Valid = {
    Adder: artifacts.require('test/valid/Adder.sol'),
    Multiply: artifacts.require('test/valid/Multiply.sol'),
    Divide: artifacts.require('test/valid/Divide.sol'),
    SysCallTest: artifacts.require('test/valid/SysCallTest.sol'),
}

const Invalid = {
    Simple: artifacts.require('test/invalid/Simple.sol')
}

// Test utility functions
function isNullAddress(address) {
    return address === "0x0000000000000000000000000000000000000000";
}

const testDebug = debug('test:Factory')
const testAccount = 0;

contract('Kernel', function (accounts) {

    describe('.listProcedures()', function () {
        it('should return nothing if zero procedures', async function () {
            let kernel = await Kernel.new();

            let procedures = await kernel.listProcedures.call();
            assert.equal(procedures.length, 0);
        })
        it('should return existing procedure keys', async function () {
            let kernel = await Kernel.new();

            let [err, address] = await kernel.createProcedure.call('TestAdder', Valid.Adder.bytecode, []);
            let tx1 = await kernel.createProcedure('TestAdder', Valid.Adder.bytecode, []);

            let procedures = await kernel.listProcedures.call();
            assert.equal(procedures.length, 1);
        });
        it('should return a list of procedures which can be retrieved', async function () {
            const kernel = await Kernel.new();
            const speccedProcedures = [
                ["TestAdder", Valid.Adder],
                ["TestDivider", Valid.Divide],
                ["TestMultiplier", Valid.Multiply]
            ];

            for (const proc of speccedProcedures) {
                await kernel.createProcedure(proc[0], proc[1].bytecode, []);
            }

            const proceduresRaw = await kernel.listProcedures.call();
            const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));

            // Test that the number of procedures stored is the same as the
            // number of procedures created
            assert.equal(procedures.length, speccedProcedures.length);
            // Cycle through each of the listed procedures
            for (const i in procedures) {
                // Test that the order and indexing of procedures is the same
                assert.equal(speccedProcedures[i][0], procedures[i])
                // Retrieve the listed procedure adress
                const address = await kernel.getProcedure.call(procedures[i]);
                // Check the address is correct
                assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`);
                assert(!isNullAddress(address), `Procedure Address (${address}) is not null`);
                // Check that the deployed code is the same as that sent
                const code = web3.eth.getCode(address);
                assert.equal(speccedProcedures[i][1].deployedBytecode, code);
            }
        });
    })
    describe('.getProcedure()', function () {
        it('should return a non-zero address iff procedure exists', async function () {
            let kernel = await Kernel.new();

            // Create "TestAdder"
            // Find the address (ephemerally)
            let [err, creationAddress] = await kernel.createProcedure.call('TestAdder', Valid.Adder.bytecode, []);
            assert(web3.isAddress(creationAddress), `Procedure Creation Address (${creationAddress}) is a real address`);
            assert(!isNullAddress(creationAddress), `Procedure Creation Address (${creationAddress}) is not null`);

            // Carry out the creation
            let tx1 = await kernel.createProcedure('TestAdder', Valid.Adder.bytecode, []);

            // Get the procedure
            let address = await kernel.getProcedure.call("TestAdder");
            assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`);
            assert(!isNullAddress(address), `Procedure Address (${address}) is not null`);

            assert.equal(creationAddress, address);
        });
        it('should return a zero address iff procedure does not exist', async function () {
            let kernel = await Kernel.new();
            // No procedures exist yet (nor does "TestAdder")
            let address = await kernel.getProcedure.call('TestAdder');
            assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`)
            assert(isNullAddress(address), `Procedure Address (${address}) is null`)
        });
    })

    describe('.createProcedure()', function () {
        it('should create valid procedure', async function () {
            let kernel = await Kernel.new();
            const procedureName = "TestAdder";
            let [err, address] = await kernel.createProcedure.call(procedureName, Valid.Adder.bytecode, []);
            let tx1 = await kernel.createProcedure(procedureName, Valid.Adder.bytecode, []);

            assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`)
            assert(!isNullAddress(address), 'Procedure Address is not null')

            // Check that the code works
            let adder = Valid.Adder.at(address);
            assert.equal(await adder.add.call(1, 1), 2)

            // Check that the address returned by getProcedure is the same as
            // the one returned by creation.
            const retrievedAddress = await kernel.getProcedure(procedureName);

            // The returned code should be the same as the sent code
            const code = web3.eth.getCode(address);
            assert.equal(Valid.Adder.deployedBytecode, code);
        });
        it('should create valid procedure (max key length)', async function () {
            const kernel = await Kernel.new();

            const proceduresRaw1 = await kernel.listProcedures.call();
            const name = "start1234567890123456end";
            assert.equal(name.length, 24);
            const [err, address] = await kernel.createProcedure.call(name, Valid.Adder.bytecode, []);
            const tx1 = await kernel.createProcedure(name, Valid.Adder.bytecode, []);

            assert(web3.isAddress(address), `Procedure Address (${address}) should be a real address`)
            assert(!isNullAddress(address), 'Procedure Address should not be null')

            const adder = Valid.Adder.at(address);
            assert.equal(await adder.add.call(1, 1), 2)

            // The returned code should be the same as the sent code
            const code = web3.eth.getCode(address);
            assert.equal(Valid.Adder.deployedBytecode, code);

            // The address should be gettable (TODO)
            // The correct name should be in the procedures table
            const proceduresRaw = await kernel.listProcedures.call();
            const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));
            assert(procedures.includes(name), "The correct name is in the procedures table");
        });

        it('should create 2 valid procedures', async function () {
            const kernel = await Kernel.new();

            const proceduresRaw1 = await kernel.listProcedures.call();
            const name = "start1234567890123456end";
            assert.equal(name.length, 24);
            const [err, address] = await kernel.createProcedure.call(name, Valid.Adder.bytecode, []);
            const tx1 = await kernel.createProcedure(name, Valid.Adder.bytecode, []);

            assert(web3.isAddress(address), `Procedure Address (#1) (${address}) should be a real address`)
            assert(!isNullAddress(address), 'Procedure Address (#1) should not be null')

            const adder = Valid.Adder.at(address);
            assert.equal(await adder.add.call(1, 1), 2)

            // The returned code should be the same as the sent code
            const code = web3.eth.getCode(address);
            assert.equal(Valid.Adder.deployedBytecode, code);
            const name2 = "ByAnyOtherName";
            const [err2, address2] = await kernel.createProcedure.call(name2, Valid.Adder.bytecode, []);
            const tx2 = await kernel.createProcedure(name2, Valid.Adder.bytecode, []);

            assert(web3.isAddress(address2), `Procedure Address (#2) (${address2}) should be a real address`)
            assert(!isNullAddress(address2), 'Procedure Address (#2) should not be null')

            // The returned code should be the same as the sent code
            const code2 = web3.eth.getCode(address2);
            assert.equal(Valid.Adder.deployedBytecode, code2);

            // The address should be gettable (TODO)
            // The correct name should be in the procedures table
            const proceduresRaw = await kernel.listProcedures.call();
            const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));
            assert(procedures.includes(name), "The correct name is in the procedures table");
        });

        // TODO: what is an invalid payload?
        it('should reject invalid payload')

        describe('should reject invalid key', function () {

            it('zero length', async function () {
                let kernel = await Kernel.new();

                let [err, creationAddress] = await kernel.createProcedure.call('', Valid.Adder.bytecode, []);
                assert.equal(err, 1);
                assert(web3.isAddress(creationAddress), `Procedure Creation Address (${creationAddress}) is a real address`)
                assert(isNullAddress(creationAddress), `Procedure Creation Address (${creationAddress}) is null`)

                const proceduresRaw = await kernel.listProcedures.call();
                const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));
                assert.equal(procedures.length, 0);
                assert(!procedures.includes(''))

                const address = await kernel.getProcedure.call('');
                assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`)
                assert(isNullAddress(address), 'Procedure Address is null')
            });

            it('duplicate procedure key', async function () {
                const kernel = await Kernel.new();
                const name = "TestAdder";

                // This is the first time the procedure is added
                const [err1, address1] = await kernel.createProcedure.call(name, Valid.Adder.bytecode, []);
                const tx1 = await kernel.createProcedure(name, Valid.Adder.bytecode, []);

                // This is the second time the procedure is added
                const [err2, address2] = await kernel.createProcedure.call(name, Valid.Multiply.bytecode, []);
                const tx2 = await kernel.createProcedure(name, Valid.Multiply.bytecode, []);
                assert.equal(err2, 3);

                const proceduresRaw = await kernel.listProcedures.call();
                const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));
                assert.equal(procedures.length, 1);

                const address = await kernel.getProcedure.call(name);
                assert.equal(address, address1);
                assert.notEqual(address, address2);
                assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`)
                assert(!isNullAddress(address), 'Procedure Address is not null')

                // The returned code should be the same as the original code
                const code = web3.eth.getCode(address);
                assert.equal(Valid.Adder.deployedBytecode, code);
            });
        })
    })

    describe('.deleteProcedure()', function () {
        it('should return error if procedure key does not exist(3)', async function () {
            const kernel = await Kernel.new();
            const [err, deleteAddress] = await kernel.deleteProcedure.call('test');
            assert.equal(err, 2);
        });
        it('should return deleted procedure address if procedure key is valid', async function () {
            const kernel = await Kernel.new();

            const [err1, address] = await kernel.createProcedure.call("test", Valid.Adder.bytecode, []);
            assert.equal(err1, 0);
            const tx1 = await kernel.createProcedure('test', Valid.Adder.bytecode, []);
            const code = web3.eth.getCode(address);
            const codeAsNumber = web3.toBigNumber(code);
            // There should be some code at this address now
            // (here it is returned as a hex, we test the string because we
            // want to also be sure it is encoded as such)
            assert.notEqual(code, "0x0");

            const [err2, deleteAddress] = await kernel.deleteProcedure.call('test');
            assert.equal(err2, 0);

            const tx2 = await kernel.deleteProcedure('test');

            assert.equal(address, deleteAddress);
        });

        it('should remove the procedure from the list on deletion', async function () {
            const kernel = await Kernel.new();

            const procedureName = "test";
            const [err1, address] = await kernel.createProcedure.call(procedureName, Valid.Adder.bytecode, []);
            assert.equal(err1, 0);
            const tx1 = await kernel.createProcedure(procedureName, Valid.Adder.bytecode, []);
            const code = web3.eth.getCode(address);
            const codeAsNumber = web3.toBigNumber(code);

            // There should be some code at this address now
            // (here it is returned as a hex, we test the string because we
            // want to also be sure it is encoded as such)
            assert.notEqual(code, "0x0");

            const [err2, deleteAddress] = await kernel.deleteProcedure.call(procedureName);
            assert.equal(err2, 0);

            const tx2 = await kernel.deleteProcedure('test');

            assert.equal(address, deleteAddress);
            const retrievedAddress = await kernel.getProcedure(procedureName);
            assert(isNullAddress, "The key be able to be retrieved")

            const proceduresRaw = await kernel.listProcedures.call();
            const procedures = proceduresRaw.map(web3.toAscii).map(s => s.replace(/\0.*$/, ''));
            assert(!procedures.includes(procedureName), "The procedure name should no longer be included in the procedure table")
        })

        // TODO: this is not currently functional
        it.skip('should destroy the procedures contract on deletion', async function () {
            const kernel = await Kernel.new();

            const [err1, address] = await kernel.createProcedure.call("test", Valid.Adder.bytecode, []);
            assert.equal(err1, 0);
            const tx1 = await kernel.createProcedure('test', Valid.Adder.bytecode, []);
            const code = web3.eth.getCode(address);
            const codeAsNumber = web3.toBigNumber(code);
            // There should be some code at this address now
            // (here it is returned as a hex, we test the string because we
            // want to also be sure it is encoded as such)
            assert.notEqual(code, "0x0");

            const [err2, deleteAddress] = await kernel.deleteProcedure.call('test');
            assert.equal(err2, 0);

            const tx2 = await kernel.deleteProcedure('test');

            assert.equal(address, deleteAddress);
            const delcode = web3.eth.getCode(deleteAddress);
            const delcodeAsNumber = web3.toBigNumber(delcode);
            // If there is nothing at the address it returns the number zero
            // (here it is returned as a hex, we test the string because we
            // want to also be sure it is encoded as such)
            assert.equal(code, "0x0");
        })

        describe('should reject invalid key', function () {
            it('zero length (1)', async function () {
                const kernel = await Kernel.new();

                const [err, deleteAddress] = await kernel.deleteProcedure.call('');
                assert.equal(err, 1);
            });
        })
    })

    describe('.executeProcedure(bytes24 key, bytes payload)', function () {
        it('should return error if procedure key does not exist(3)', async function () {
            const kernel = await Kernel.new();
            const [err, retVal] = await kernel.executeProcedure.call('test', '', "");
            assert.equal(err, 3);
        });

        describe('should execute', function () {
            describe('Simple Procedure', function () {
                it('X() should fail', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    // need to have the ABI definition in JSON as per specification
                    const [errX, valueX] = await kernel.executeProcedure.call("Simple", "X()", "");
                    assert.equal(errX.toNumber(), 4, "X() should fail");
                })

                it('A() should succeed', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    const [err1, value1] = await kernel.executeProcedure.call("Simple", "A()", "");
                    assert.equal(err1.toNumber(), 0, "A() should succeed");
                })

                it('B() should succeed', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    const [err2, value2] = await kernel.executeProcedure.call("Simple", "B()", "");
                    assert.equal(err2.toNumber(), 0, "B() should succeed");
                    assert.notEqual(web3.eth.getCode(kernel.address), "0x0", "B() should not yet destroy kernel");

                    const tx2 = await kernel.executeProcedure("Simple", "B()", "");
                    assert.equal(web3.eth.getCode(kernel.address), "0x0", "B() should destroy kernel");
                })

                it('C() should fail without correctly specifying arguments', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    const [err, value] = await kernel.executeProcedure.call("Simple", "C()", "");
                    assert.equal(err.toNumber(), 4, "C() should not succeed");
                })

                it('C() should fail when using type synonyms such as uint, which cant be used in function selectors', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    const [err, value] = await kernel.executeProcedure.call("Simple", "C()", "");
                    assert.equal(err.toNumber(), 4, "C() should not succeed");
                })

                it('C(uint256) should succeed passing arguments', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("Simple", Invalid.Simple.bytecode, []);
                    const tx = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);

                    const [err, value] = await kernel.executeProcedure.call("Simple", "C(uint256)", "");
                    assert.equal(err.toNumber(), 0, "C(uint256) should succeed");
                })

            })
            describe('SysCall Procedure', function () {
                it('S() should succeed when given cap', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("SysCallTest", Valid.SysCallTest.bytecode, [3, 0x7, 0x8500, 0x2, 3, 0x7, 0x8000, 0x0]);
                    const tx = await kernel.createProcedure("SysCallTest", Valid.SysCallTest.bytecode, [3, 0x7, 0x8500, 0x2, 3, 0x7, 0x8000, 0x0]);

                    // need to have the ABI definition in JSON as per specification
                    const [errX, valueX] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    // This code is for printing out raw information from the
                    // procedure table
                    // console.log("errX:", errX.toNumber());
                    // console.log("valueX:", valueX.toNumber());
                    // const val = await kernel.returnProcedureTable.call();
                    // let vVals = [];
                    // for (const v of val) {
                    //     vVals.push("0x" + v.toNumber().toString(16));
                    // }
                    // console.log("val:", vVals);
                    // console.log("len:", vVals.length);
                    assert.equal(errX.toNumber(), 0, "S() should succeed with zero errcode the first time");
                    assert.equal(valueX.toNumber(), 4, "S() should succeed with correct value the first time");

                    // do it again to check that the value has been correctly incremented
                    const [err2, value2] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    assert.equal(err2.toNumber(), 0, "S() should succeed with zero errcode the second time");
                    assert.equal(value2.toNumber(), 5, "S() should succeed with correct value the second time");
                })
                it('S() should fail when not given cap', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("SysCallTest", Valid.SysCallTest.bytecode, []);
                    const tx = await kernel.createProcedure("SysCallTest", Valid.SysCallTest.bytecode, []);

                    // need to have the ABI definition in JSON as per specification
                    const [errX, valueX] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    // 4 is the error code we are after
                    assert.equal(errX.toNumber(), 4, "S() should succeed with zero errcode the first time");
                    assert.equal(valueX.toNumber(), 905, "S() should succeed with correct value the first time");

                    // do it again
                    const [err2, value2] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    // 4 is the error code we are after
                    assert.equal(err2.toNumber(), 4, "S() should succeed with zero errcode the second time");
                    assert.equal(value2.toNumber(), 905, "S() should succeed with correct value the second time");
                })
                it('S() should fail when trying to write to an address below its cap', async function () {
                    const kernel = await Kernel.new();
                    const [, address] = await kernel.createProcedure.call("SysCallTest", Valid.SysCallTest.bytecode, [3, 0x7, 0x8001, 0x0]);
                    const tx = await kernel.createProcedure("SysCallTest", Valid.SysCallTest.bytecode, [3, 0x7, 0x8001, 0x0]);

                    // need to have the ABI definition in JSON as per specification
                    const [errX, valueX] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    // 4 is the error code we are after
                    assert.equal(errX.toNumber(), 4, "S() should succeed with zero errcode the first time");
                    assert.equal(valueX.toNumber(), 905, "S() should succeed with correct value the first time");

                    // do it again
                    const [err2, value2] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                    await kernel.executeProcedure("SysCallTest", "S()", "");
                    // 4 is the error code we are after
                    assert.equal(err2.toNumber(), 4, "S() should succeed with zero errcode the second time");
                    assert.equal(value2.toNumber(), 905, "S() should succeed with correct value the second time");
                })
            })
        })

        describe('Discover Procedure Table', function () {
            it('should print a procedure table', async function () {
                const kernel = await Kernel.new();
                const tx1 = await kernel.createProcedure("SysCallTest", Valid.SysCallTest.bytecode, [3, 0x7, 0x8500, 0x2, 3, 0x7, 0x8000, 0x0]);
                const tx2 = await kernel.createProcedure("Simple", Invalid.Simple.bytecode, []);
                const rawProcTable = await kernel.returnProcedureTable.call();

                // First print it raw
                // let vVals = [];
                // for (const v in rawProcTable) {
                //     console.log(v, ": " + web3.toHex(rawProcTable[v]));
                // }
                // console.log("val:", vVals);
                // console.log("len:", vVals.length);

                const procTable = parseProcedureTable(rawProcTable);
                // printProcedureTable(procTable);
                let procedures = await kernel.listProcedures.call();
                assert.equal(procedures, Object.keys(procTable), "Procedure keys should be the same as returned by listProcedures");
            })
        })

        describe.skip('Entry Procedure', function () {
            it('should return the entry procedure address', async function () {
                const kernel = await Kernel.new();
                const procedureName = "Entry";
                const [a, address] = await kernel.createProcedure.call(procedureName, Valid.SysCallTest.bytecode, [3, 0x7, 0x80, 0x0]);
                // assert.equal(a.toNumber(), 0, "S() should succeed with zero errcode the second time");
                const tx = await kernel.createProcedure(procedureName, Valid.SysCallTest.bytecode, [3, 0x7, 0x80, 0x0]);
                const valueA = await kernel.getProcedure.call(procedureName);
                // const
                // console.log(errA, valueA);
                // console.log(errA)
                // console.log("valueA:", valueA)

                // // need to have the ABI definition in JSON as per specification
                // const [errX, valueX] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                // await kernel.executeProcedure("SysCallTest", "S()", "");
                // assert.equal(errX.toNumber(), 0, "S() should succeed with zero errcode the first time");
                // assert.equal(valueX.toNumber(), 4, "S() should succeed with correct value the first time");

                // // do it again
                // const [err2, value2] = await kernel.executeProcedure.call("SysCallTest", "S()", "");
                // await kernel.executeProcedure("SysCallTest", "S()", "");
                // assert.equal(err2.toNumber(), 0, "S() should succeed with zero errcode the second time");
                // assert.equal(value2.toNumber(), 5, "S() should succeed with correct value the second time");
            })
        })

        it('should return an error if key does not exist (3)', async function () {
            const kernel = await Kernel.new();
            const [err, retVal] = await kernel.executeProcedure.call('test', '', "");
            assert.equal(err, 3);
        });

        describe('should return an error if procedure return error when', function () {
            it('receives invalid arguments')
            it('throws an error', async function () {
                let kernel = await Kernel.new();

                let [err, address] = await kernel.createProcedure.call('TestDivide', Valid.Divide.bytecode, []);
                let tx1 = await kernel.createProcedure('TestDivide', Valid.Divide.bytecode, []);

                assert(web3.isAddress(address), `Procedure Address (${address}) is a real address`)
                assert(!isNullAddress(address), 'Procedure Address is not null')

                let divide = Valid.Divide.at(address);
                assert.equal(await divide.divide.call(8, 2), 4);

                // The returned code should be the same as the sent code
                const code = web3.eth.getCode(address);
                assert.equal(Valid.Divide.deployedBytecode, code);

                // Try dividing by zero
                try {
                    const divideByZero = await divide.divide.call(8, 0);
                } catch (e) {
                    assert.equal(e, "Error: VM Exception while processing transaction: invalid opcode");
                }
            });
        })

        describe('should reject invalid key', function () {
            it('zero length (1)', async function () {
                const kernel = await Kernel.new();

                const [err, retVal] = await kernel.executeProcedure.call('', '', '');
                assert.equal(err, 1);
            });
        })
    })
})

function parseProcedureTable(val) {
    const procTable = {};
    for (let i = 0; i < val.length; i++) {
        const proc = {};
        // Key
        proc.key = web3.toHex(val[i]);
        // KeyIndex
        proc.keyIndex = web3.toHex(val[i+1]);
        // Location
        proc.location = web3.toHex(val[i+2]);
        // Capabilities
        proc.caps = [];
        const nCapKeys = val[i+3].toNumber();
        for (let j = 0; j < nCapKeys; j++) {
            const cap = {};
            const length = web3.toHex(val[i+4+j+0]);
            cap.type = web3.toHex(val[i+4+j+1]);
            // (length - 1) as the first value is the length
            cap.values = [];
            for (let k = 0; k < (length-1); k++) {
                cap.values.push(web3.toHex(val[i+6+j+k]));
            }
            j = j + length;
            proc.caps.push(cap);
        }
        // i = i + nCapKeys;
        i = i + (255);
        procTable[proc.key] = proc;
    }
    return procTable;
}

function printProcedureTable(procTable) {
    for (const procKey of Object.keys(procTable)) {
        const proc = procTable[procKey];
        // Print key
        console.log(`Key: ${proc.key}`);
        // Print keyIndex
        console.log(`  KeyIndex: ${proc.keyIndex}`);
        // Print location
        console.log(`  Location: ${proc.location}`);
        // Print Capabilities
        console.log(`  Capabilities(${proc.caps.length} keys)`);
        for (const i in proc.caps) {
            const cap = proc.caps[i];
            console.log(`    Capability[${i}]: Type: ${cap.type}`);
            for (const j in cap.values) {
                console.log(`      ${j}: ${cap.values[j]}`)

            }
        }
    }
}