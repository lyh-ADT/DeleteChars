class FlexSizeByteArrayReader{
    constructor(array){
        this.array = array;
        this.reset();
    }

    reset(){
        this.index = 0;
        this.left_size = 8;
        this.read_value = 0;
        this.read_size = 0;
    }

    read(size){
        if(this.left_size === 0){
            this.index++;
            if(this.index >= this.array.length){
                throw new Error("数据不足");
            }
            this.left_size = 8;
        }
        if(this.left_size >= size){
            let mask = (1 << size) - 1;
            this.read_value |= (this.array[this.index] & mask) << this.read_size;
            this.left_size -= size;
            let out = this.read_value;
            this.read_value = 0;
            this.read_size = 0;
            return out;
        } else {
            let mask = ((1 << this.left_size) - 1) << (8 - this.left_size);
            this.read_value = this.array[this.index] & mask >> (8 - this.left_size);
            let left_size = this.left_size;
            this.read_size += left_size;
            this.left_size = 0;
            return this.read(size - left_size);
        }
    }
}

class LZWDecoder{
    constructor(min_code_size, array, color_count, color_table=null){
        this.min_code_size = min_code_size;
        this.array = array;
        this.color_count = color_count;
        this.color_table = color_table;
        this.code_table = {};
        let table_size = (1 << min_code_size) - 1;
        this.clear_code = table_size + 1;
        this.end_of_infomation_code = this.clear_code + 1;
        this.initialCodeTable();
    }

    initialCodeTable(){
        this.code_table = {};
        this.code_table = {};
        this.code_index = this.end_of_infomation_code;
        for(let i=0; i < this.color_count; i++){
            this.code_table[i] = i;
        }
    }

    decode(code_stream){
        let c = code_stream[0];
        let index_stream = [this.code_table[c]];
        let k = 0;
        let old = c;
        for(let i=1; i < code_stream.length; ++i){
            c = code_stream[i];
            if(this.code_table[c] === undefined){
                k = this.code_table[old][0];
                let out = this.code_table[old]+k;
                index_stream.push(out);
                this.code_table[this.code_index++] = out;
            } else {
                index_stream.push(this.code_table[c]);
                this.code_table[this.code_index++] = this.code_table[old]+this.code_table[c];
            }
        }
        return index_stream;
    }
}