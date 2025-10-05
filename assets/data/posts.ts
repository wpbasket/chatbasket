import { Post } from "@/model/Post";
const millisec_in_hr=3600000;

const posts:Post[]=[
    {
        id:'Post1',
        user: '1',
        content:'Hello wp1',
        created_date:Date.now()
    },
    {
        id:'Post2',
        user:'2', // Changed to User2
        content:'Hello wp2',
        created_date:Date.now()-millisec_in_hr
    },
    {
        id:'Post3',
        user:'3', // Changed to User3
        content:'Hello wp3',
        created_date:Date.now()-2*millisec_in_hr
    },
    {
        id:'Post4',
        user:'1',
        content:'Hello wp4',
        created_date:Date.now()-3*millisec_in_hr
    },
    {
        id:'Post5',
        user:'2', // Changed to User2
        content:'Hello wp5',
        created_date:Date.now()-4*millisec_in_hr
    },
    {
        id:'Post6',
        user:'3', // Changed to User3
        content:'Hello wp6',
        created_date:Date.now()-5*millisec_in_hr
    },
    {
        id:'Post7',
        user:'1',
        content:'Hello wp7',
        created_date:Date.now()-6*millisec_in_hr
    },
    {
        id:'Post8',
        user:'2', // Changed to User2
        content:'Hello wp8',
        created_date:Date.now()-7*millisec_in_hr
    },
    {
        id:'Post9',
        user:'3', // Changed to User3
        content:'Hello wp9',
        created_date:Date.now()-8*millisec_in_hr
    },
    {
        id:'Post10',
        user:'1',
        content:'Hello wp10',
        created_date:Date.now()-9*millisec_in_hr
    },
    {
        id:'Post11',
        user:'2', // Changed to User2
        content:'Hello wp11',
        created_date:Date.now()-10*millisec_in_hr
    },
    {
        id:'Post12',
        user:'3', // Changed to User3
        content:'Hello wp12',
        created_date:Date.now()-11*millisec_in_hr
    },
    {
        id:'Post13',
        user:'1',
        content:'Hello wp13',
        created_date:Date.now()-12*millisec_in_hr
    },
    {
        id:'Post14',
        user:'2', // Changed to User2
        content:'Hello wp14',
        created_date:Date.now()-13*millisec_in_hr
    },
    {
        id:'Post15',
        user:'3', // Changed to User3
        content:'Hello wp15',
        created_date:Date.now()-14*millisec_in_hr
    },
    {
        id:'Post16',
        user:'1',
        content:'Hello wp16',
        created_date:Date.now()-15*millisec_in_hr
    },
    {
        id:'Post17',
        user:'2', // Changed to User2
        content:'Hello wp17',
        created_date:Date.now()-16*millisec_in_hr
    },
    {
        id:'Post18',
        user:'3', // Changed to User3
        content:'Hello wp18',
        created_date:Date.now()-17*millisec_in_hr
    },
    {
        id:'Post19',
        user:'1',
        content:'Hello wp19',
        created_date:Date.now()-18*millisec_in_hr
    },
    {
        id:'Post20',
        user:'2', // Changed to User2
        content:'Hello wp20',
        created_date:Date.now()-19*millisec_in_hr
    }

];
export default posts;