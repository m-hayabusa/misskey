export class extendRequestId1662590495890 {
    name = 'extendRequestId1662590495890'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "follow_request" ALTER COLUMN "requestId" TYPE character varying(256)`);
    }

    async down(queryRunner) {
				await queryRunner.query(`ALTER TABLE "follow_request" ALTER COLUMN "requestId" TYPE character varying(128)`);	
    }
}
