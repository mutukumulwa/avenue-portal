-- AlterTable
ALTER TABLE "_ProducerSchemes" ADD CONSTRAINT "_ProducerSchemes_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ProducerSchemes_AB_unique";
