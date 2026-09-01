import { DeploymentRunner } from "../server/deployment-runner";

type Job = {
  deploymentId: string;
};

class DeploymentQueue {
  private queue: Job[] = [];
  private isProcessing = false;

  public add(deploymentId: string) {
    this.queue.push({ deploymentId });
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift();

    if (job) {
      try {
        console.log(`[Queue] Processing deployment job ${job.deploymentId}`);
        await DeploymentRunner.runDeployment({ deploymentId: job.deploymentId });
      } catch (err) {
        console.error(`[Queue] Error running job ${job.deploymentId}:`, err);
      } finally {
        this.isProcessing = false;
        this.processNext();
      }
    } else {
      this.isProcessing = false;
    }
  }

  public getPendingCount(): number {
    return this.queue.length;
  }
}

const globalForQueue = global as unknown as { deploymentQueue: DeploymentQueue };

export const deploymentQueue =
  globalForQueue.deploymentQueue || new DeploymentQueue();

if (process.env.NODE_ENV !== "production") {
  globalForQueue.deploymentQueue = deploymentQueue;
}
