export class PGroonga1652210810723 {
    name = 'PGroonga1652210810723'

    async up(queryRunner) {
				await queryRunner.query(`CREATE EXTENSION pgroonga`);
        await queryRunner.query(`CREATE INDEX "IDX_f27f5d88941e57442be75ba9c8" ON "note" USING "pgroonga" ("text")`);
    }

    async down(queryRunner) {
				await queryRunner.query(`DROP EXTENSION pgroonga`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f27f5d88941e57442be75ba9c8"`);
    }
}
