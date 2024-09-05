import { Bool, Bytes, PublicKey, Struct, UInt32, UInt64, Provable } from "o1js";
import runtime from "..";
import { runtimeMethod, RuntimeModule, runtimeModule, state } from "@proto-kit/module";
import { assert, State, StateMap } from "@proto-kit/protocol";
import { inject } from "tsyringe";
import { StakingRegistry } from "./staking";


/**
 * Task
 * @param name - The name of the task
 * @param epochs - The number of epochs
 * @param modelType - The type of model 1 - CNN, 2 - RNN, 3 - LSTM
 * @param modelSize - The size of the model
 * @param numOfLayers - The number of layers
 * @param activationFunction - The activation function 1 - ReLU, 2 - Sigmoid, 3 - Tanh
 * @param Optimizer - The optimizer 1 - SGD, 2 - Adam, 3 - RMSprop
 * @param completed - Whether the task is completed
 * @param publisher - The public key of the publisher
 * @param feePerEpoch - The fee per epoch
 */
export class Task extends Struct({
    name: Bytes(32),
    epochs: UInt64,
    modelType: UInt64,
    modelSize: UInt64,
    numOfLayers: UInt64,
    activationFunction: UInt64,
    Optimizer: UInt64,
    completed: Bool,
    publisher: PublicKey,
    feePerEpoch: UInt64
}) {
    public static from(
        name: Bytes,
        epochs: UInt64,
        modelType: UInt64,
        modelSize: UInt64,
        numOfLayers: UInt64,
        activationFunction: UInt64,
        Optimizer: UInt64,
        completed: Bool,
        publisher: PublicKey,
        feePerEpoch: UInt64
    ): Task {
        return new Task({
            name,
            epochs,
            modelType,
            modelSize,
            numOfLayers,
            activationFunction,
            Optimizer,
            completed,
            publisher,
            feePerEpoch
        });
    }
};

type PublisherConfig = Record<string, never>;

@runtimeModule()
export class Publisher extends RuntimeModule<PublisherConfig> {
    @state() public TASKS_LENGTH = State.from<UInt32>(UInt32);
    @state() public tasks = StateMap.from<UInt32, Task>(UInt32, Task);
    @state() public clients = StateMap.from<UInt32, Array<PublicKey>>(UInt32, Provable.Array(PublicKey, 3));

    // constructor(@inject("StakingRegistry") public stakingRegistry: StakingRegistry) {
    //     super();
    // }

    @runtimeMethod()
    public async addTask(
        name: Bytes,
        epochs: UInt64,
        modelType: UInt64,
        modelSize: UInt64,
        numOfLayers: UInt64,
        activationFunction: UInt64,
        Optimizer: UInt64,
        feePerEpoch: UInt64
    ): Promise<void> {
        //TODO: Check feePerEpoch*epochs >= message.value 
        const tasksLength = await this.TASKS_LENGTH.get();
        const task = Task.from(
            name,
            epochs,
            modelType,
            modelSize,
            numOfLayers,
            activationFunction,
            Optimizer,
            Bool.fromValue(false),
            this.transaction.sender.value,
            feePerEpoch
        );
        await this.tasks.set(tasksLength.value, task);
        this.TASKS_LENGTH.set(tasksLength.value.add(UInt32.from(1)));
    }

    @runtimeMethod()
    public async completeTask(taskId: UInt32): Promise<void> {
        const sender = this.transaction.sender.value;
        const task = await this.tasks.get(taskId);

        assert(task.value.publisher.equals(sender), "Only the publisher can complete the task");

        task.value.completed = Bool.fromValue(true);
        await this.tasks.set(taskId, task.value);
        await this._distributeFunds(taskId);
    }

    async _distributeFunds(taskId: UInt32) {
        const task = await this.tasks.get(taskId);
        const clients = (await this.clients.get(taskId)).value;
        const feePerEpoch = task.value.feePerEpoch;
        const epochs = task.value.epochs;
        const totalFee = feePerEpoch.mul(epochs);
        const feePerClient = totalFee.div(UInt64.from(clients.length));
        // for (let i = 0; i < clients.length; i++) {
        //     await runtime.balances.addBalance(clients[i], feePerClient);
        // }
        //TODO: Add the fee to the clients
    }

    @runtimeMethod()
    public async addClient(client: PublicKey, taskId: UInt32): Promise<void> {
        // const hasClienStaked = await this.stakingRegistry.hasStakedAddress(client);
        // assert(hasClienStaked, "Client has not staked");
        const clients = (await this.clients.get(taskId)).value;
        assert(Bool.fromValue(clients.length < 3), "Only 3 clients can be added to a task");
        clients.push(client);
        await this.clients.set(taskId, clients);
    }

    @runtimeMethod()
    public async getTask(taskId: UInt32): Promise<Task> {
        return (await this.tasks.get(taskId)).value;
    }

}